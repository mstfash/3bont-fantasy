export class CommandRejected extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'CommandRejected';
    this.code = code;
  }
}
