package com.example.wealthmaster.imports;

import com.example.wealthmaster.users.OwnerPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import java.util.*;
import java.io.IOException;
import static com.example.wealthmaster.imports.ImportDtos.*;

@RestController
@RequestMapping("/api/v1/imports")
public class ImportController {
    private final ImportService service;
    public ImportController(ImportService service){this.service=service;}
    @GetMapping public List<Summary> list(@AuthenticationPrincipal OwnerPrincipal owner){return service.list(owner.id());}
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    public Batch upload(@AuthenticationPrincipal OwnerPrincipal owner,@RequestParam("file") MultipartFile file) throws IOException {return service.upload(owner.id(),file.getBytes());}
    @GetMapping("/{id}") public Batch get(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return service.get(owner.id(),id);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteDraft(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestParam long version){service.deleteDraft(owner.id(),id,version);}
    @GetMapping("/{id}/source") public ResponseEntity<byte[]> source(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).header("Content-Disposition","attachment; filename=legacy-workbook.xlsm").cacheControl(CacheControl.noStore()).body(service.source(owner.id(),id));}
    @PutMapping("/{id}/selection") public Batch configure(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestBody Configure input){return service.configure(owner.id(),id,input);}
    @PutMapping("/{id}/plan") public Batch save(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestBody Save input){return service.save(owner.id(),id,input);}
    @GetMapping("/{id}/preview") public Preview preview(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return service.preview(owner.id(),id);}
    @PostMapping("/{id}/commit") public Receipt commit(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestBody Approval input){return service.commit(owner.id(),id,input);}
    @GetMapping("/{id}/undo") public UndoPreview undoPreview(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id){return service.undoPreview(owner.id(),id);}
    @PostMapping("/{id}/undo") public Batch undo(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestBody Undo input){return service.undo(owner.id(),id,input);}
    @DeleteMapping("/{id}/source") @ResponseStatus(HttpStatus.NO_CONTENT) public void purge(@AuthenticationPrincipal OwnerPrincipal owner,@PathVariable UUID id,@RequestParam long version){service.purge(owner.id(),id,version);}
}
