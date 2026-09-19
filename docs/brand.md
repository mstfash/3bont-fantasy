# 3BONT FANTASY

The user selected this product name on 18 September 2026. It replaces the earlier RAKZA proposal. The parent 3BONT identity is supplied by the user; do not invent a replacement symbol.

## Selected sources

Source folder: `/Users/moarafa/Downloads/drive-download-20260918T183121Z-1-001/`.

| Locale  | Background | Original file       | Reason                                                            |
| ------- | ---------- | ------------------- | ----------------------------------------------------------------- |
| Arabic  | Dark       | `3BONT LOGO-04.png` | Pale stacked Arabic mark; consistent with the English counterpart |
| English | Dark       | `3BONT LOGO-05.png` | Pale stacked English mark                                         |
| Arabic  | Light      | `3BONT LOGO-12.png` | Deep navy counterpart of 04                                       |
| English | Light      | `3BONT LOGO-13.png` | Deep navy counterpart of 05                                       |

Keep the stylized numeral, brand lettering, registered symbol and proportions. Replace the existing small tagline with **فانتازي** in Arabic and **FANTASY** in English. The descriptor uses heavy forward-slanted lettering compatible with the supplied marks. Generated edits require visual review before adoption; the original files are retained unchanged.

Both public and administrative interfaces use the same locale/theme asset mapping. Theme colors are CSS custom properties; changing application colors must not silently recolor the supplied logo artwork. Provide a deliberate light or dark logo choice appropriate to its immediate background, including when a page has contrasting panels.

Vikings informs layout structure, typography scale, density, borders and spacing. Its name, crest, images and restricted demo fonts are not part of this identity.

## Exports and preview

The four app assets live in `apps/web/public/brand/`, named `3bont-fantasy-{ar|en}-{dark|light}.png`. The originals are preserved in the `originals/` subdirectory. `/brand` is a local, non-indexed comparison page with download links for all four.

Edits use the built-in image-generation tool. [Initial prompts](brand-prompts.json) and [dark export refinement prompts](brand-refinement-prompts.json) are retained. These are generated adaptations, not a claim of pixel-identical vector reproduction. The light versions have transparent backgrounds. The dark export refinements use an opaque dark background because the initial transparent white exports contained visible speckles; those rejected drafts are not used by the application.

The reusable component is `apps/web/src/components/brand-logo.tsx`; the locale/background mapping is `apps/web/src/lib/brand.ts`. Application theme colors live in `apps/web/src/styles/theme.css`. Dark opaque exports are suitable for the selected dark surface; arbitrary contrasting backgrounds should use the transparent light mark or an explicitly prepared alternate asset, rather than silently applying a color filter.
