export type Status =
  | "pending"
  | "pass"
  | "warning"
  | "fail";

export function statusLabel(
  status: Status
) {
  if (status === "pass") {
    return "PASS";
  }

  if (status === "warning") {
    return "WARNING";
  }

  if (status === "fail") {
    return "FAIL";
  }

  return "Niet getest";
}
