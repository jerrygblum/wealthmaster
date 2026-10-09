package com.example.wealthmaster.accounts;

public class AccountFailure extends RuntimeException {
    private final int status;
    public AccountFailure(int status, String message) { super(message); this.status = status; }
    public int status() { return status; }
}
