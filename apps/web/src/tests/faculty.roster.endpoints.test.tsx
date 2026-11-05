import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RosterMarksPage } from "../pages/faculty/RosterMarksPage.js";
import { FacultyMarksEntryPage } from "../pages/faculty/MarksEntryPage.js";

// The faculty pages read the roster through endpoints that are gated per
// role. `/api/faculty/*` is `requireRole("faculty")` and `/api/admin/*` is
// `requireRole("admin")`, so a faculty page pointed at an admin endpoint 403s
// for every faculty user, and an admin page pointed at a faculty endpoint
// 403s for every admin.
//
// These assertions exist because that mismatch is invisible to a test that
// mocks one URL for every role: the page renders "no students enrolled"
// instead of failing, so the wrong endpoint looks like empty data.
//
// Only the courses fixture needs a real shape — the other endpoints have to
// be *requested* for this test to mean anything, but their contents are
// irrelevant here.

const requestedPaths = vi.hoisted(() => [] as string[]);

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockImplementation((path: string) => {
    requestedPaths.push(path);
    if (path === "/api/faculty/courses" || path === "/api/admin/courses") {
      return Promise.resolve({
        data: [
          {
            id: "c1",
            code: "CS101",
            title: "Intro to CS",
            semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" },
          },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
}));

beforeEach(() => {
  requestedPaths.length = 0;
});

function renderRosterMarks(role: "faculty" | "admin"): void {
  render(
    <MemoryRouter initialEntries={[`/${role}/marks/c1/roster`]}>
      <Routes>
        <Route
          path={`/${role}/marks/:courseId/roster`}
          element={<RosterMarksPage role={role} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderMarksEntry(): void {
  render(
    <MemoryRouter initialEntries={["/faculty/marks/c1"]}>
      <Routes>
        <Route path="/faculty/marks/:courseId" element={<FacultyMarksEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * The enrollments read is the last of the three roster requests — it is
 * gated on the course resolving, so it implies the courses read happened.
 */
async function waitForEnrollments(prefix: string): Promise<void> {
  await waitFor(() => {
    expect(requestedPaths.some((p) => p.startsWith(prefix))).toBe(true);
  });
}

describe("faculty roster endpoints", () => {
  it("reads the faculty marks roster from the faculty endpoints", async () => {
    renderRosterMarks("faculty");
    await waitForEnrollments("/api/faculty/enrollments");

    expect(requestedPaths).toContain("/api/faculty/students");
    expect(requestedPaths).toContain("/api/faculty/courses");
    expect(requestedPaths).not.toContain("/api/admin/students");
    expect(requestedPaths).not.toContain("/api/admin/courses");
    expect(requestedPaths.some((p) => p.startsWith("/api/admin/enrollments"))).toBe(false);
  });

  it("reads the admin marks roster from the admin endpoints", async () => {
    renderRosterMarks("admin");
    await waitForEnrollments("/api/admin/enrollments");

    expect(requestedPaths).toContain("/api/admin/students");
    expect(requestedPaths).toContain("/api/admin/courses");
    expect(requestedPaths).not.toContain("/api/faculty/students");
    expect(requestedPaths).not.toContain("/api/faculty/courses");
    expect(requestedPaths.some((p) => p.startsWith("/api/faculty/enrollments"))).toBe(false);
  });

  it("reads the marks entry page from the faculty endpoints", async () => {
    renderMarksEntry();
    await waitForEnrollments("/api/faculty/enrollments");

    expect(requestedPaths).toContain("/api/faculty/students");
    expect(requestedPaths).toContain("/api/faculty/courses");
    expect(requestedPaths).not.toContain("/api/admin/students");
    expect(requestedPaths).not.toContain("/api/admin/courses");
    expect(requestedPaths.some((p) => p.startsWith("/api/admin/enrollments"))).toBe(false);
  });
});
