import { Position } from 'vscode';

interface MockUri {
  fsPath: string;
  toString(): string;
}

interface MockDocument {
  fileName: string;
  uri: MockUri;
  getText(): string;
  offsetAt(position: Position): number;
  positionAt(offset: number): Position;
}

interface MockEditor {
  document: MockDocument;
  setDecorations: jest.Mock;
}

export function createDocument(fileName: string, content: string): MockDocument {
  const lineOffsets = computeLineOffsets(content);

  return {
    fileName,
    uri: {
      fsPath: fileName,
      toString: () => `file://${fileName}`,
    },
    getText: () => content,
    offsetAt(position: Position): number {
      const lineOffset = lineOffsets[position.line] ?? content.length;
      return lineOffset + position.character;
    },
    positionAt(offset: number): Position {
      let line = 0;
      while (line + 1 < lineOffsets.length && lineOffsets[line + 1] <= offset) {
        line++;
      }
      return new Position(line, offset - lineOffsets[line]);
    },
  };
}

export function createEditor(document: MockDocument): MockEditor {
  return {
    document,
    setDecorations: jest.fn(),
  };
}

function computeLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}
