import { describe, expect, it } from "vitest";
import { bookingStatusConfig, getBookingStatus } from "./status-display";

describe("getBookingStatus", () => {
  it("returns the matching config for known statuses", () => {
    expect(getBookingStatus("pendiente")).toBe(bookingStatusConfig.pendiente);
    expect(getBookingStatus("confirmada")).toBe(bookingStatusConfig.confirmada);
    expect(getBookingStatus("rechazada")).toBe(bookingStatusConfig.rechazada);
  });

  it("falls back to pendiente on an unknown status string", () => {
    expect(getBookingStatus("not-a-real-status")).toBe(
      bookingStatusConfig.pendiente,
    );
    expect(getBookingStatus("")).toBe(bookingStatusConfig.pendiente);
  });

  it("each variant has the dark-theme class triple", () => {
    for (const v of Object.values(bookingStatusConfig)) {
      expect(v.classes).toMatch(/bg-[a-z]+(-\d+)?\/10/);
      expect(v.classes).toMatch(/text-[a-z]+(-\d+)?/);
      expect(v.classes).toMatch(/border-[a-z]+(-\d+)?\/20/);
    }
  });
});
