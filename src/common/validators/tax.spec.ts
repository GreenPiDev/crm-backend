import { isValidTaxNumber } from './tax';

describe('isValidTaxNumber', () => {
  it('geçerli TCKN (11 hane) kabul eder', () => {
    expect(isValidTaxNumber('10000000146')).toBe(true);
  });

  it('geçerli VKN (10 hane) kabul eder', () => {
    expect(isValidTaxNumber('1234567890')).toBe(true);
  });

  it('geçersiz kontrol basamaklı TCKN reddeder', () => {
    expect(isValidTaxNumber('10000000147')).toBe(false);
  });

  it('geçersiz kontrol basamaklı VKN reddeder', () => {
    expect(isValidTaxNumber('1234567891')).toBe(false);
  });

  it("0 ile başlayan TCKN'yi reddeder", () => {
    expect(isValidTaxNumber('01234567890')).toBe(false);
  });

  it('yanlış uzunluğu reddeder', () => {
    expect(isValidTaxNumber('12345')).toBe(false);
  });

  it('rakam olmayan karakter içerenleri reddeder', () => {
    expect(isValidTaxNumber('123456789a')).toBe(false);
  });
});
