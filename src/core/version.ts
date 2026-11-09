// Versions of eidos as `eidos --version` prints them, and their order (REQ21).

// `eidosmd 0.21.0 (standard 5.10.0)`: the CLI's version is the first one printed
export function parseVersionOutput(output: string): string | null {
  const match = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(output);
  return match?.[1] ?? null;
}

// Semver precedence without build metadata: a pre-release sorts before its release
export function compareVersions(left: string, right: string): number {
  const [leftCore = '', leftPre] = left.split('-', 2);
  const [rightCore = '', rightPre] = right.split('-', 2);
  const leftParts = leftCore.split('.').map(Number);
  const rightParts = rightCore.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (leftPre === undefined && rightPre === undefined) return 0;
  if (leftPre === undefined) return 1;
  if (rightPre === undefined) return -1;
  return comparePreRelease(leftPre, rightPre);
}

function comparePreRelease(left: string, right: string): number {
  const leftIds = left.split('.');
  const rightIds = right.split('.');
  for (let i = 0; i < Math.max(leftIds.length, rightIds.length); i++) {
    const a = leftIds[i];
    const b = rightIds[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b);
      if (difference !== 0) return Math.sign(difference);
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}
