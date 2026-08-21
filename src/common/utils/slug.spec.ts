import { slugify } from './slug';

describe('slugify', () => {
  it('Türkçe karakterleri ASCII karşılığına çevirir', () => {
    expect(slugify('Öztürk Çelik A.Ş.')).toBe('ozturk-celik-a-s');
  });

  it('boşlukları ve özel karakterleri tire ile değiştirir', () => {
    expect(slugify('Acme  Yazılım & Bilişim')).toBe('acme-yazilim-bilisim');
  });

  it('baştaki ve sondaki tireleri temizler', () => {
    expect(slugify('--Merhaba Dünya--')).toBe('merhaba-dunya');
  });
});
