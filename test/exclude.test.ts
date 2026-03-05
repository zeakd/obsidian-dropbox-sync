import { describe, expect, test } from "bun:test";
import { matchExcludePattern, isExcluded } from "../src/exclude";

describe("matchExcludePattern", () => {
  test("directory pattern matches everything under it", () => {
    expect(matchExcludePattern("attachments/image.png", "attachments/")).toBe(true);
    expect(matchExcludePattern("attachments/sub/deep.jpg", "attachments/")).toBe(true);
    expect(matchExcludePattern("other/file.md", "attachments/")).toBe(false);
  });

  test("extension pattern without / matches filename in any directory", () => {
    expect(matchExcludePattern("file.pdf", "*.pdf")).toBe(true);
    expect(matchExcludePattern("notes/file.pdf", "*.pdf")).toBe(true);
    expect(matchExcludePattern("deep/nested/doc.pdf", "*.pdf")).toBe(true);
    expect(matchExcludePattern("file.md", "*.pdf")).toBe(false);
  });

  test("pattern with / matches full path", () => {
    expect(matchExcludePattern(".obsidian/workspace.json", ".obsidian/workspace*")).toBe(true);
    expect(matchExcludePattern(".obsidian/workspace", ".obsidian/workspace*")).toBe(true);
    expect(matchExcludePattern(".obsidian/plugins.json", ".obsidian/workspace*")).toBe(false);
  });

  test("** matches across path separators", () => {
    expect(matchExcludePattern("images/sub/photo.png", "images/**/*.png")).toBe(true);
    expect(matchExcludePattern("images/photo.png", "images/**/*.png")).toBe(true);
    expect(matchExcludePattern("images/photo.jpg", "images/**/*.png")).toBe(false);
  });

  test("? matches single non-separator character", () => {
    expect(matchExcludePattern("file1.md", "file?.md")).toBe(true);
    expect(matchExcludePattern("fileAB.md", "file?.md")).toBe(false);
  });

  test("case insensitive matching", () => {
    expect(matchExcludePattern("FILE.PDF", "*.pdf")).toBe(true);
    expect(matchExcludePattern("Notes/Doc.PDF", "*.pdf")).toBe(true);
  });

  test("dots in pattern are literal", () => {
    expect(matchExcludePattern(".DS_Store", ".DS_Store")).toBe(true);
    expect(matchExcludePattern("xDS_Store", ".DS_Store")).toBe(false);
  });
});

describe("isExcluded", () => {
  test("matches against any pattern in the list", () => {
    const patterns = [".obsidian/workspace*", "*.pdf", "attachments/"];
    expect(isExcluded(".obsidian/workspace.json", patterns)).toBe(true);
    expect(isExcluded("doc.pdf", patterns)).toBe(true);
    expect(isExcluded("attachments/img.png", patterns)).toBe(true);
    expect(isExcluded("notes/readme.md", patterns)).toBe(false);
  });

  test("empty patterns excludes nothing", () => {
    expect(isExcluded("anything.md", [])).toBe(false);
  });
});
