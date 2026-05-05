declare module 'bezier-js' {
  export class Bezier {
    constructor(...points: { x: number; y: number }[]);
    length(): number;
  }
}
