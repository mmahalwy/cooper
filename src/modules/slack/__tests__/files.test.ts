import { describe, it, expect } from 'vitest';
import { extractFileArtifacts } from '../files';

// ---------------------------------------------------------------------------
// extractFileArtifacts
// ---------------------------------------------------------------------------

describe('extractFileArtifacts', () => {
  it('returns an empty array when steps have no toolResults', () => {
    const result = extractFileArtifacts([{}, { toolResults: [] }]);
    expect(result).toEqual([]);
  });

  it('returns an empty array when toolResults have no artifacts', () => {
    const steps = [
      {
        toolResults: [
          { result: { someOtherField: 'value' } },
          { result: null },
          { result: 'a plain string' },
        ],
      },
    ];
    const result = extractFileArtifacts(steps);
    expect(result).toEqual([]);
  });

  it('extracts an image artifact and decodes base64 content into a Buffer', () => {
    const base64 = Buffer.from('fake-image-bytes').toString('base64');
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'image', base64, filename: 'chart.png' },
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('chart.png');
    expect(result[0].mimeType).toBe('image/png');
    expect(Buffer.isBuffer(result[0].content)).toBe(true);
    expect(result[0].content).toEqual(Buffer.from('fake-image-bytes'));
  });

  it('uses the default filename "output.png" when image artifact has no filename', () => {
    const base64 = Buffer.from('img').toString('base64');
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [{ type: 'image', base64 }],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);

    expect(result[0].filename).toBe('output.png');
  });

  it('extracts a file artifact with its string content', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'file', content: 'hello world', filename: 'report.txt' },
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('report.txt');
    expect(result[0].content).toBe('hello world');
    expect(result[0].mimeType).toBeUndefined();
  });

  it('uses the default filename "output.txt" when file artifact has no filename', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [{ type: 'file', content: 'data' }],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);

    expect(result[0].filename).toBe('output.txt');
  });

  it('skips image artifacts that have no base64 field', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'image' }, // missing base64
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);
    expect(result).toEqual([]);
  });

  it('skips file artifacts that have no content field', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'file' }, // missing content
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);
    expect(result).toEqual([]);
  });

  it('collects artifacts from multiple steps and multiple toolResults', () => {
    const base64 = Buffer.from('img').toString('base64');
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'image', base64, filename: 'a.png' },
              ],
            },
          },
        ],
      },
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'file', content: 'csv data', filename: 'data.csv' },
              ],
            },
          },
          {
            result: {
              artifacts: [
                { type: 'image', base64, filename: 'b.png' },
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.filename)).toEqual(['a.png', 'data.csv', 'b.png']);
  });

  it('ignores artifact entries with unrecognised types', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              artifacts: [
                { type: 'video', url: 'https://example.com/clip.mp4' },
              ],
            },
          },
        ],
      },
    ];

    const result = extractFileArtifacts(steps);
    expect(result).toEqual([]);
  });

  it('handles toolResults where result is not an object gracefully', () => {
    const steps = [
      {
        toolResults: [
          { result: 42 },
          { result: undefined },
          { result: false },
        ],
      },
    ];

    expect(() => extractFileArtifacts(steps)).not.toThrow();
    expect(extractFileArtifacts(steps)).toEqual([]);
  });
});
