import { describe, expect, it } from 'vitest';

import { buildReactComponentSrcdoc, prepareReactComponentSource } from './react-component';

describe('prepareReactComponentSource', () => {
  it('adapts a default function export for iframe rendering', () => {
    const out = prepareReactComponentSource(`
import React from 'react';
export default function Card() {
  return <div>Card</div>;
}
`);
    expect(out).not.toContain('import React');
    expect(out).toContain('function Card()');
    expect(out).toContain('window.__OpenDesignComponent');
    expect(out).toContain("typeof Card !== 'undefined' ? Card : null");
  });

  it('adapts a named component export for iframe rendering', () => {
    const out = prepareReactComponentSource('export const Preview = () => <main />;');
    expect(out).toContain('const Preview =');
    expect(out).toContain("typeof Preview !== 'undefined' ? Preview : null");
  });
});

describe('buildReactComponentSrcdoc', () => {
  it('builds a standalone sandbox document with React runtime scripts', () => {
    const doc = buildReactComponentSrcdoc('export default function App(){ return <div /> }', {
      title: 'App',
    });
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('react@18/umd/react.development.js');
    expect(doc).toContain('@babel/standalone');
    expect(doc).toContain('artifact.tsx');
  });
});
