package com.example.wealthmaster.budgets;

public class CategoryFailure extends RuntimeException {
    private final int status;
    public CategoryFailure(int status, String message) { super(message); this.status = status; }
    public int status() { return status; }
}
