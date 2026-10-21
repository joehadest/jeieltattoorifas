import type { Settings } from './domain.ts';

const field = (id: string, value: string) => `${id}${String(new TextEncoder().encode(value).length).padStart(2, '0')}${value}`;
const ascii = (value: string, length: number) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().slice(0, length);
export function crc16(value: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function pixPayload(settings: Settings, amount: number) {
  if (!settings.pix_key || !settings.receiver_name || !settings.receiver_city || !Number.isFinite(amount) || amount <= 0) return '';
  const key = settings.pix_key.trim();
  if (new TextEncoder().encode(key).length > 77) return '';
  const receiver = ascii(settings.receiver_name, 25);
  const city = ascii(settings.receiver_city, 15);
  if (!receiver || !city) return '';
  const payload = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', key)) + field('52', '0000') + field('53', '986') + field('54', amount.toFixed(2)) + field('58', 'BR') + field('59', receiver) + field('60', city) + field('62', field('05', '***')) + '6304';
  return payload + crc16(payload);
}
