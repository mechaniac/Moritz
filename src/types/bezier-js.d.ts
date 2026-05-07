declare module 'bezier-js' {
  export class Bezier {
    constructor(...points: { x: number; y: number }[]);
    length(): number;
    project(p: { x: number; y: number }): { x: number; y: number; t: number; d: number };
  }
}
