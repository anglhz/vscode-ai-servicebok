import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "../lib/validation/auth";

describe("auth validation", () => {
  it("rejects malformed email and missing password", () => {
    expect(loginSchema.safeParse({ email: "wrong", password: "" }).success).toBe(false);
  });
  it("normalizes email whitespace without changing passwords", () => {
    expect(loginSchema.parse({ email: " test@example.com ", password: " keep spaces " })).toEqual({ email: "test@example.com", password: " keep spaces " });
  });
  it("does not lock existing users out with a new signup minimum", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "oldpass" }).success).toBe(true);
  });
  it("enforces signup length and confirmation", () => {
    for (const [password, confirmPassword] of [["a".repeat(7), "a".repeat(7)], ["a".repeat(129), "a".repeat(129)], ["a".repeat(8), "b".repeat(8)]]) {
      expect(signupSchema.safeParse({ email: "a@example.com", password, confirmPassword }).success).toBe(false);
    }
    for (const length of [8, 128]) {
      expect(signupSchema.safeParse({ email: "a@example.com", password: "a".repeat(length), confirmPassword: "a".repeat(length) }).success).toBe(true);
    }
  });
});
