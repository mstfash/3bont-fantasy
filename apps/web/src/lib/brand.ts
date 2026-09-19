export type Locale = 'ar' | 'en';
export type ColorMode = 'dark' | 'light';

export const BRAND = {
  name: '3BONT FANTASY',
  localizedName: { ar: '٣ بونط فانتازي', en: '3BONT FANTASY' },
  logos: {
    ar: {
      dark: '/brand/3bont-fantasy-ar-dark.png',
      light: '/brand/3bont-fantasy-ar-light.png',
    },
    en: {
      dark: '/brand/3bont-fantasy-en-dark.png',
      light: '/brand/3bont-fantasy-en-light.png',
    },
  },
} as const;
