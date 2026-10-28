// 第三方模块类型垫片（无官方 @types 时用）
declare module 'yauzl' {
  export function open(path: string, opts: any, cb: (err: any, zipfile: any) => void): void;
}
declare module '7z-wasm' {
  const factory: (opts?: any) => Promise<any>;
  export default factory;
}
declare module 'node-unrar-js' {
  export function createExtractorFromFile(opts: any): Promise<any>;
}
declare module 'node-stream-zip' {
  export class StreamZip { constructor(opts: any); on(e: string, cb: (...a: any[]) => void): void; }
}
