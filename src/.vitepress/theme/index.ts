import type {Theme} from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import {gradleDslSync} from './gradle-dsl';
import './custom.css';

export default ({
  extends: DefaultTheme,
  enhanceApp: (({router}): void => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Intentional.
    if(globalThis.window === undefined) {
      return;
    }

    router.onAfterRouteChange = ((to: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- dataLayer is defined by GTM
      ;(globalThis as any).dataLayer?.push({
        event: 'page_view',
        page_path: to
      });
    });

    // Must run after the GTM assignment above because this wraps the current
    // `onAfterRouteChange`.
    gradleDslSync(router);
  })
} satisfies Theme);
