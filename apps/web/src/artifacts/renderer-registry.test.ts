import { describe, expect, it } from 'vitest';

import { artifactRendererRegistry } from './renderer-registry';
import type { ProjectFile } from '../types';

function file(input: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    size: 100,
    mtime: 1,
    kind: 'code',
    mime: 'text/typescript; charset=utf-8',
    ...input,
  };
}

describe('artifactRendererRegistry', () => {
  it('routes JSX and TSX files to the React component renderer', () => {
    expect(
      artifactRendererRegistry.resolve({
        file: file({ name: 'Hero.jsx' }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
    expect(
      artifactRendererRegistry.resolve({
        file: file({ name: 'Hero.tsx' }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
  });

  it('prefers an explicit React manifest over the coarse code kind', () => {
    expect(
      artifactRendererRegistry.resolve({
        file: file({
          name: 'entry.txt',
          kind: 'text',
          artifactManifest: {
            version: 1,
            kind: 'react-component',
            title: 'Entry',
            entry: 'entry.txt',
            renderer: 'react-component',
            exports: ['jsx', 'html', 'zip'],
          },
        }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
  });
});
