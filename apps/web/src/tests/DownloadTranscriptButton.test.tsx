import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: () => ({
    userId: "h1",
    role: "student",
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

import { DownloadTranscriptButton } from "../components/DownloadTranscriptButton.js";

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
  }
});

describe("DownloadTranscriptButton", () => {
  it("renders disabled when `disabled` is true", () => {
    render(<DownloadTranscriptButton url="/api/..." disabled label="Download Transcript" />);
    const btn = screen.getByRole("button", { name: /download transcript/i });
    expect(btn).toBeDisabled();
  });

  it("calls fetch with the URL when clicked and triggers a download", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
        status: 200, headers: { "content-type": "application/pdf" },
      }),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<DownloadTranscriptButton url="/api/student/b1/p1/s1/transcript" label="Download Transcript" />);
    fireEvent.click(screen.getByRole("button", { name: /download transcript/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/student/b1/p1/s1/transcript", expect.any(Object)));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});