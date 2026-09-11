# Third-party notices

## Money Forward Cloud React UI

Source: https://github.com/moneyforward/cloud-react-ui
Pinned source revision: `2ef9d67b4196b1178a23fe780f37cc6b652a6516`
License: MIT, Copyright 2021 Money Forward. The complete license is included in `src/components/mf/LICENSE.txt`.

The locally adapted TextField, Block and StatusLabel in `src/components/mf/` derive from the upstream components at `src/components/TextField/TextField.tsx`, `src/components/Block/Block.tsx`, `src/components/StatusLabel/StatusLabel.tsx`, and the corresponding `src/theme/theme.ts` and `src/theme/color.ts` styles.

Changes: replaced styled-components/theme injection with scoped CSS; retained forwardRef and native input props; added accessible error state and keyboard focus; corrected StatusLabel's ref to HTMLSpanElement; adjusted contrast, sizing and spacing for the onboarding form. The original package is not installed because it depends on React 17 and Material UI 4; this project uses React 18. No Money Forward branding or private code is used. Higher-level onboarding screens and business logic are original to this project.
