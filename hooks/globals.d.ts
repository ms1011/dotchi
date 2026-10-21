// 실행 환경에는 있지만 TypeScript 5.8 lib에는 아직 없는 base64 메서드
interface Uint8Array {
  toBase64(): string
}
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}
