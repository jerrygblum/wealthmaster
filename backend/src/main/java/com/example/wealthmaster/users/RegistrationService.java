package com.example.wealthmaster.users;

import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.*;
import java.time.*;
import java.util.*;

@Service
public class RegistrationService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    public RegistrationService(JdbcTemplate jdbc, UserRepository users, PasswordEncoder passwords, Clock clock) {
        this.jdbc=jdbc; this.users=users; this.passwords=passwords; this.clock=clock;
    }
    public record Settings(boolean enabled, long version) {}
    public record SettingInput(@NotNull Boolean enabled) {}
    public record InviteInput(@NotBlank @Email @Size(max=254) String email) {
        public InviteInput { if(email!=null) email=RegistrationService.email(email); }
    }
    public record Signup(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=64) String code,
                         @NotBlank @Size(min=12,max=72) String password) {
        public Signup { if(email!=null) email=RegistrationService.email(email); }
        @Override public String toString() { return "Signup[redacted]"; }
    }
    public record Invitation(UUID id, String email, Instant createdAt, Instant expiresAt, String status, long version) {}
    public record Issued(Invitation invitation, String code) {
        @Override public String toString() { return "Issued[redacted]"; }
    }
    public record Management(Settings settings, List<Invitation> invitations) {}
    private record Stored(Invitation invitation, String hash, Instant revoked, Instant used) {}
    public static String email(String value) { return value.strip().toLowerCase(Locale.ROOT); }
    private void owner(UUID actor) {
        if(users.findById(actor).map(AppUser::getRole).orElse(AppUser.Role.MEMBER)!=AppUser.Role.OWNER)
            throw new SecurityFailure(403,"Only the owner can manage registration.");
    }
    private Settings settings(boolean lock) {
        return jdbc.queryForObject("SELECT enabled,version FROM registration_settings WHERE id=1"+(lock?" FOR UPDATE":""),
                (r,n)->new Settings(r.getBoolean(1),r.getLong(2)));
    }
    public boolean enabled() { return settings(false).enabled(); }
    private void version(String match,long actual) {
        if(match==null) throw new SecurityFailure(428,"Reload registration settings before changing them.");
        if(!match.matches("\"[0-9]+\"")) throw new SecurityFailure(400,"If-Match must contain a quoted version.");
        if(!match.equals("\""+actual+"\"")) throw new SecurityFailure(412,"Registration settings changed. Reload and try again.");
    }
    private Stored row(ResultSet r,int n) throws SQLException {
        var revoked=r.getTimestamp("revoked_at");var used=r.getTimestamp("used_at");var expires=r.getTimestamp("expires_at").toInstant();
        String status=used!=null?"USED":revoked!=null?"REVOKED":!clock.instant().isBefore(expires)?"EXPIRED":"ACTIVE";
        return new Stored(new Invitation(r.getObject("id",UUID.class),r.getString("email"),r.getTimestamp("created_at").toInstant(),expires,status,r.getLong("version")),
                r.getString("code_hash"),revoked==null?null:revoked.toInstant(),used==null?null:used.toInstant());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Management management(UUID actor) {
        owner(actor);
        return new Management(settings(false),jdbc.query("SELECT * FROM registration_invitations ORDER BY created_at DESC,id",this::row).stream().map(Stored::invitation).toList());
    }
    @Transactional
    public Settings configure(UUID actor,String match,SettingInput input) {
        owner(actor);var before=settings(true);version(match,before.version());
        jdbc.update("UPDATE registration_settings SET enabled=?,version=version+1 WHERE id=1",input.enabled());
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id,details) VALUES(?,?,'REGISTRATION_CHANGED',?,jsonb_build_object('beforeEnabled',?::boolean,'afterEnabled',?::boolean))",UUID.randomUUID(),actor,actor,before.enabled(),input.enabled());
        return settings(false);
    }
    private void audit(UUID actor,String type,UUID resource) {
        jdbc.update("INSERT INTO audit_events(id,actor_id,event_type,resource_id) VALUES(?,?,?,?)",UUID.randomUUID(),actor,type,resource);
    }
    private String code() { var bytes=new byte[32];random.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    private String hash(String code) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable."); }
    }
    @Transactional
    public Issued invite(UUID actor,InviteInput input) {
        owner(actor);settings(true);var email=email(input.email());
        if(users.findByEmail(email).isPresent()) throw new SecurityFailure(409,"This email already has an account.");
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM registration_invitations WHERE email=?)",Boolean.class,email)))
            throw new SecurityFailure(409,"This email already has an invitation. Replace its code instead.");
        var id=UUID.randomUUID();var code=code();var now=clock.instant();
        jdbc.update("INSERT INTO registration_invitations(id,email,code_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)",id,email,hash(code),actor,Timestamp.from(now),Timestamp.from(now.plus(Duration.ofDays(7))));
        audit(actor,"INVITATION_CREATED",id);return new Issued(stored(id).invitation(),code);
    }
    private Stored stored(UUID id) {
        var rows=jdbc.query("SELECT * FROM registration_invitations WHERE id=?",this::row,id);
        if(rows.isEmpty()) throw new SecurityFailure(404,"Invitation not found.");return rows.getFirst();
    }
    @Transactional
    public Issued replace(UUID actor,UUID id,String match) {
        owner(actor);settings(true);var before=stored(id);version(match,before.invitation().version());
        if(before.used()!=null || users.findByEmail(before.invitation().email()).isPresent()) throw new SecurityFailure(409,"This email already has an account.");
        var code=code();
        jdbc.update("UPDATE registration_invitations SET code_hash=?,expires_at=?,revoked_at=NULL,version=version+1 WHERE id=?",hash(code),Timestamp.from(clock.instant().plus(Duration.ofDays(7))),id);
        audit(actor,"INVITATION_REPLACED",id);return new Issued(stored(id).invitation(),code);
    }
    @Transactional
    public Invitation revoke(UUID actor,UUID id,String match) {
        owner(actor);settings(true);var before=stored(id);version(match,before.invitation().version());
        if(before.used()!=null) throw new SecurityFailure(409,"This invitation has already been used.");
        jdbc.update("UPDATE registration_invitations SET revoked_at=?,version=version+1 WHERE id=?",Timestamp.from(clock.instant()),id);
        audit(actor,"INVITATION_REVOKED",id);return stored(id).invitation();
    }
    // Independent transaction lets the outer AttemptLimiter retain failed-attempt counters after a rejected signup.
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public AppUser register(Signup input) {
        if(input.password().getBytes(StandardCharsets.UTF_8).length>72) throw new SecurityFailure(400,"Password must use at most 72 UTF-8 bytes.");
        if(!settings(true).enabled()) throw new SecurityFailure(403,"Registration is disabled.");
        var email=email(input.email());
        var rows=jdbc.query("SELECT * FROM registration_invitations WHERE email=? AND code_hash=?",this::row,email,hash(input.code()));
        if(rows.isEmpty() || !rows.getFirst().invitation().status().equals("ACTIVE") || users.findByEmail(email).isPresent())
            throw new SecurityFailure(403,"Unable to register with these details. Ask the owner for a valid invitation.");
        var invitation=rows.getFirst().invitation();
        var user=users.saveAndFlush(new AppUser(email,passwords.encode(input.password())));
        jdbc.update("INSERT INTO user_mfa(user_id) VALUES(?)",user.getId());
        jdbc.update("UPDATE registration_invitations SET used_at=?,used_by=?,version=version+1 WHERE id=?",Timestamp.from(clock.instant()),user.getId(),invitation.id());
        audit(user.getId(),"USER_REGISTERED",user.getId());audit(user.getId(),"INVITATION_USED",invitation.id());
        return user;
    }
}
