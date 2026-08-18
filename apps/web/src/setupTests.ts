import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// happy-dom (like jsdom) keeps the document between tests by default. Reset
// it after each one so getBy* queries don't see duplicate DOM.
afterEach(() => cleanup());
