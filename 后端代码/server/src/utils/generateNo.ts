/**
 * 生成业务编号
 * @param prefix 前缀，如 'IB', 'OB', 'TF', 'LOG'
 * @returns 格式: PREFIX-YYYYMMDD-TTTTTT-RRR
 */
export function generateNo(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${prefix}-${date}-${timestamp}-${random}`
}
