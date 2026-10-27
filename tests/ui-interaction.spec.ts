import { test, expect } from '@playwright/test';

// ==========================================
// 1. サンプル版 (sumaito_sample/index.html) のテスト
// ==========================================
test.describe('サンプル版 LP (sumaito_sample/index.html) の UI 操作テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/sumaito_sample/index.html');
  });

  test('FAQアコーディオンがクリックで開閉し、排他制御されること', async ({ page }) => {
    const faqItems = page.locator('.faq-item');
    await expect(faqItems).toHaveCount(3);

    const firstBtn = faqItems.nth(0).locator('.faq-btn');
    const firstAnswer = faqItems.nth(0).locator('.faq-answer');
    const firstIcon = faqItems.nth(0).locator('.faq-icon');

    const secondBtn = faqItems.nth(1).locator('.faq-btn');
    const secondAnswer = faqItems.nth(1).locator('.faq-answer');

    // 1. 初期状態: 全て非表示
    await expect(firstAnswer).toBeHidden();
    await expect(secondAnswer).toBeHidden();
    await expect(firstIcon).toHaveText('＋');

    // 2. 1つ目をクリック: 展開されること
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();
    await expect(firstIcon).toHaveText('✕');

    // 3. もう一度クリック: 閉じること
    await firstBtn.click();
    await expect(firstAnswer).toBeHidden();
    await expect(firstIcon).toHaveText('＋');

    // 4. 1つ目を開いた状態で2つ目をクリック: 1つ目が閉じて2つ目が開くこと（排他制御）
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();

    await secondBtn.click();
    await expect(firstAnswer).toBeHidden();
    await expect(secondAnswer).toBeVisible();
  });

  test('モバイルメニューが展開・収納されること', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'モバイル端末でのみ実行');

    const menuBtn = page.locator('#mobile-menu-btn');
    const mobileMenu = page.locator('#mobile-menu');

    // 初期状態: 非表示
    await expect(mobileMenu).toBeHidden();

    // ハンバーガーボタン押下: 展開
    await menuBtn.click();
    await expect(mobileMenu).toBeVisible();

    // メニュー内の主要リンクが最新構成（仕組み・ご紹介の流れ・運営会社）を含みページ順であること
    const menuLinks = mobileMenu.locator('a');
    const linkTexts = await menuLinks.allTextContents();
    const cleanedTexts = linkTexts.map(t => t.trim()).filter(t => t.length > 0);

    expect(cleanedTexts).toContain('理念');
    expect(cleanedTexts).toContain('サービス');
    expect(cleanedTexts).toContain('sumaitoの仕組み');
    expect(cleanedTexts).toContain('ご紹介の流れ');
    expect(cleanedTexts).toContain('よくある質問');
    expect(cleanedTexts).toContain('運営会社について');

    // メニュー内のリンクをクリック: 閉じる
    await mobileMenu.locator('a').first().click();
    await expect(mobileMenu).toBeHidden();
  });
});

// ==========================================
// 2. 本番クリーン版 (sumaito/index.html) のテスト
// ==========================================
test.describe('本番クリーン版 LP (sumaito/index.html) の UI・整合性テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/sumaito/index.html');
  });

  test('FAQアコーディオンがクリックで開閉すること', async ({ page }) => {
    const faqItems = page.locator('.faq-item');
    await expect(faqItems).toHaveCount(3);

    const firstBtn = faqItems.nth(0).locator('.faq-btn');
    const firstAnswer = faqItems.nth(0).locator('.faq-answer');

    await expect(firstAnswer).toBeHidden();
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();
    await firstBtn.click();
    await expect(firstAnswer).toBeHidden();
  });

  test('レビュー用注記（赤入れポイント・修正反映済みボックス）が本番版に混入していないこと', async ({ page }) => {
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('赤入れポイント');
    expect(bodyText).not.toContain('修正反映済み');
  });
});

// ==========================================
// 3. 枠組み版 (sumaito_frame/index.html) のテスト
// ==========================================
test.describe('住宅系LP枠組みテンプレート (_templates/housing_lp_frame/index.html) の UI 操作テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/_templates/housing_lp_frame/index.html');
  });

  test('FAQアコーディオンがクリックで開閉すること', async ({ page }) => {
    const faqItems = page.locator('.faq-item');
    await expect(faqItems).toHaveCount(3);

    const firstBtn = faqItems.nth(0).locator('.faq-btn');
    const firstAnswer = faqItems.nth(0).locator('.faq-answer');

    // 初期状態: 非表示
    await expect(firstAnswer).toBeHidden();

    // 1回目クリック: 開く
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();

    // 2回目クリック: 閉じる
    await firstBtn.click();
    await expect(firstAnswer).toBeHidden();
  });

  test('「無料」という断定表記が残っていないこと', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    // 枠組み版では「無料」という決め打ちは排除されていること
    expect(bodyText).not.toContain('LINEで無料相談');
    expect(bodyText).not.toContain('無料でご紹介できる仕組み');
    expect(bodyText).not.toContain('完全無料');
  });
});

// ==========================================
// 4. いけだ屋 (ikedaya) のテスト
// ==========================================
test.describe('いけだ屋 LP (ikedaya) の UI・整合性テスト', () => {

  test('確認レビュー版 (ikedaya_sample) に注記が存在し、Instagramリンクが正しいこと', async ({ page }) => {
    await page.goto('/ikedaya_sample/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(4);

    const igLinks = page.locator('a[href*="instagram.com/karaage_ikedaya"]');
    expect(await igLinks.count()).toBeGreaterThan(0);
  });

  test('本番クリーン版 (ikedaya) に注記（赤入れポイント）が混入していないこと', async ({ page }) => {
    await page.goto('/ikedaya/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('赤入れポイント');
    expect(bodyText).not.toContain('要ヒアリング');
  });

  test('初期枠組み版 (ikedaya_frame) にプレースホルダーが存在し注記がないこと', async ({ page }) => {
    await page.goto('/ikedaya_frame/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('【ここにメインキャッチコピーを書く】');
  });
});

// ==========================================
// 5. bar Mano a Mano (manoamano) のテスト
// ==========================================
test.describe('bar Mano a Mano LP (manoamano) の UI・整合性テスト', () => {

  test('確認レビュー版 (manoamano_sample) に注記が存在し、電話・Instagramリンクが正しいこと', async ({ page }) => {
    await page.goto('/manoamano_sample/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(6);

    // 電話発信リンクの確認
    const telLinks = page.locator('a[href="tel:080-4999-0246"]');
    expect(await telLinks.count()).toBeGreaterThan(0);

    // bar Mano a Mano 公式Instagramリンクの確認
    const igLinks = page.locator('a[href*="instagram.com/barmanoamano"]');
    expect(await igLinks.count()).toBeGreaterThan(0);

    // いけだ屋 公式Instagramリンクの確認
    const ikedayaIgLinks = page.locator('a[href*="instagram.com/karaage_ikedaya"]');
    expect(await ikedayaIgLinks.count()).toBeGreaterThan(0);

    // ヘッダーおよびセクションの存在確認
    const foodtruckNav = page.locator('a[href="#foodtruck"]');
    expect(await foodtruckNav.count()).toBeGreaterThan(0);
    await expect(page.locator('#foodtruck')).toBeVisible();
  });

  test('本番クリーン版 (manoamano) に注記（赤入れポイント）が混入していないこと', async ({ page }) => {
    await page.goto('/manoamano/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('赤入れポイント');
    expect(bodyText).not.toContain('要ヒアリング');
    expect(bodyText).not.toContain('修正反映済み');
  });

  test('初期枠組み版 (manoamano_frame) にプレースホルダーが存在し注記がないこと', async ({ page }) => {
    await page.goto('/manoamano_frame/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('【ここにメインキャッチコピー】');
  });

  test('確認レビュー版 (manoamano_sample) で多言語切り替え（EN, KO, 繁體, JA）が動作し、日本語復元時に差分タグが保持されること', async ({ page, isMobile }) => {
    // 日本語指定でアクセス
    await page.goto('/manoamano_sample/index.html?lang=ja');

    // 初期状態: 日本語（差分タグ del/ins が存在すること）
    await expect(page.locator('del.diff-del').first()).toBeVisible();
    await expect(page.locator('ins.diff-ins').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

    if (isMobile) {
      // モバイル環境: select またはモバイルメニュー内ボタンで切替
      const select = page.locator('#mobile-lang-select');

      // 1. 英語 (EN)
      await select.selectOption('en');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('Unwind in a Warm, Welcoming Night.');

      // 2. 繁体字 (zh-TW)
      await select.selectOption('zh-TW');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('沉醉於溫暖舒心的松山之夜');

      // 3. 韓国語 (KO)
      await select.selectOption('ko');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('마음이 편안해지는 밤을');

      // 4. 日本語 (JA) へ戻す -> 差分タグが復元されること
      await select.selectOption('ja');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await expect(page.locator('del.diff-del').first()).toBeVisible();
      await expect(page.locator('ins.diff-ins').first()).toBeVisible();
    } else {
      // デスクトップ環境: ボタングループで切替
      const enBtn = page.locator('.lang-btn[data-lang="en"]').first();
      await enBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('Unwind in a Warm, Welcoming Night.');
      await expect(page.locator('[data-i18n="nav_concept"]').first()).toHaveText('Concept');
      await expect(page.locator('[data-i18n="nav_foodtruck"]').first()).toHaveText('Food Truck');
      await expect(page.locator('[data-i18n="truck_h2"]')).toContainText('Popular Local Food Truck');
      await expect(page.locator('[data-i18n="sig_drink_tag2"]')).toHaveText('Rotating Seasonal Fruit Specials');
      await expect(page.locator('[data-i18n="party_h2"]')).toContainText('Private Hire / Events');
      await expect(page.locator('[data-i18n="info_hours_dd"]')).toContainText('8:00 PM – approx. 3:00 AM');

      const twBtn = page.locator('.lang-btn[data-lang="zh-TW"]').first();
      await twBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('沉醉於溫暖舒心的松山之夜');
      await expect(page.locator('[data-i18n="nav_concept"]').first()).toHaveText('品牌概念');
      await expect(page.locator('[data-i18n="nav_foodtruck"]').first()).toHaveText('人氣餐車');
      await expect(page.locator('[data-i18n="truck_h2"]')).toContainText('巡迴愛媛各地的超人氣餐車');
      await expect(page.locator('[data-i18n="atmo_tag3"]')).toHaveText('• 歡迎續攤小酌');
      await expect(page.locator('[data-i18n="party_h2"]')).toContainText('10至30位即可包場！');

      const koBtn = page.locator('.lang-btn[data-lang="ko"]').first();
      await koBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('마음이 편안해지는 밤을');
      await expect(page.locator('[data-i18n="nav_concept"]').first()).toHaveText('컨셉');
      await expect(page.locator('[data-i18n="nav_foodtruck"]').first()).toHaveText('푸드트럭');
      await expect(page.locator('[data-i18n="truck_h2"]')).toContainText('에히메현을 누비는 인기 푸드트럭');
      await expect(page.locator('[data-i18n="nav_signature"]').first()).toHaveText('2대 대표 메뉴');
      await expect(page.locator('[data-i18n="party_plan_dd"]')).toContainText('음료 무제한(노미호다이)');

      const jaBtn = page.locator('.lang-btn[data-lang="ja"]').first();
      await jaBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await expect(page.locator('del.diff-del').first()).toBeVisible();
      await expect(page.locator('ins.diff-ins').first()).toBeVisible();
      await expect(page.locator('[data-i18n="nav_concept"]').first()).toHaveText('コンセプト');
    }

    // 5. URLパラメータ（?lang=tw エイリアス含む）でのアクセス検証
    await page.goto('/manoamano_sample/index.html?lang=tw');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.locator('[data-i18n="hero_sub"]')).toContainText('沉醉於溫暖舒心的松山之夜');
  });
});

// ==========================================
// 6. 株式会社Livre アサヒワークス (car_hub) のテスト
// ==========================================
test.describe('株式会社Livre アサヒワークス LP (car_hub) の UI・整合性テスト', () => {

  test('確認レビュー版 (car_hub_sample) に理念・実情報・FAQ・4大サービス・積載車写真が存在すること', async ({ page }) => {
    await page.goto('/car_hub_sample/index.html');

    // 理念および4大サービスセクションの存在確認（保険事業は要望により一旦非表示）
    await expect(page.locator('#philosophy')).toBeVisible();
    await expect(page.locator('#sales')).toBeVisible();
    await expect(page.locator('#rentacar')).toBeVisible();
    await expect(page.locator('#lease')).toBeVisible();
    await expect(page.locator('#insurance')).toHaveCount(0);
    await expect(page.locator('#roadservice')).toBeVisible();

    // 自社積載車写真の存在確認（ロードサービスカード内）
    const truckImg = page.locator('#roadservice img[src="images/carrier_trucks.jpg"]');
    await expect(truckImg).toBeVisible();

    // ヒーロー背景スライダーの存在確認（5枚構成）
    const heroSlides = page.locator('.hero-bg-slide');
    await expect(heroSlides).toHaveCount(5);

    // 実電話番号およびLINE実リンクの確認
    const telLinks = page.locator('a[href="tel:089-909-8577"]');
    expect(await telLinks.count()).toBeGreaterThan(0);

    const lineLinks = page.locator('a[href*="lin.ee/S6OS2fb"]');
    expect(await lineLinks.count()).toBeGreaterThan(0);

    // FAQアコーディオンの排他制御 ＆ WAI-ARIAテスト
    const faqItems = page.locator('.faq-item');
    await expect(faqItems).toHaveCount(3);

    const firstBtn = faqItems.nth(0).locator('.faq-btn');
    const firstAnswer = faqItems.nth(0).locator('.faq-answer');
    const firstIcon = faqItems.nth(0).locator('.faq-icon');

    const secondBtn = faqItems.nth(1).locator('.faq-btn');
    const secondAnswer = faqItems.nth(1).locator('.faq-answer');

    // 初期状態: 非表示 ＆ aria-expanded="false"
    await expect(firstAnswer).toBeHidden();
    await expect(secondAnswer).toBeHidden();
    await expect(firstIcon).toHaveText('＋');
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');

    // 1つ目を開く: 展開 ＆ aria-expanded="true"
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();
    await expect(firstIcon).toHaveText('✕');
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'true');

    // 2つ目を開く -> 1つ目が閉じる（排他制御）
    await secondBtn.click();
    await expect(firstAnswer).toBeHidden();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(secondAnswer).toBeVisible();
    await expect(secondBtn).toHaveAttribute('aria-expanded', 'true');
  });

  test('本番クリーン版 (car_hub) に注記が混入しておらず、お問い合わせフォームのState管理が機能すること', async ({ page }) => {
    await page.goto('/car_hub/index.html');
    const reviewTips = page.locator('.review-tip');
    await expect(reviewTips).toHaveCount(0);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('赤入れポイント');
    expect(bodyText).not.toContain('要ヒアリング');
    expect(bodyText).not.toContain('修正反映済み');

    // FAQ WAI-ARIA 動作確認
    const firstBtn = page.locator('.faq-item').first().locator('.faq-btn');
    const firstAnswer = page.locator('.faq-item').first().locator('.faq-answer');
    await expect(firstAnswer).toBeHidden();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');
    await firstBtn.click();
    await expect(firstAnswer).toBeVisible();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'true');

    // お問い合わせフォーム State管理テスト（Submitting -> Success）
    const form = page.locator('#contact-form');
    await expect(form).toBeVisible();

    const submitBtn = page.locator('#contact-submit-btn');
    const successMsg = page.locator('#contact-success-msg');
    await expect(successMsg).toBeHidden();

    // フォーム入力
    await form.locator('input[type="text"]').fill('テスト太郎');
    await form.locator('input[type="tel"]').fill('090-1234-5678');
    await form.locator('input[type="email"]').fill('test@example.com');
    await form.locator('select').selectOption('sales');

    // 送信
    await submitBtn.click();

    // Success 状態の確認（インラインメッセージが表示され、role="status" を持つこと）
    await expect(successMsg).toBeVisible({ timeout: 3000 });
    await expect(successMsg).toHaveAttribute('role', 'status');
    await expect(successMsg).toContainText('お問い合わせを受け付けました');
  });

  test('ポータル (index.html) に car_hub の各リンクが存在すること', async ({ page }) => {
    await page.goto('/index.html');
    const cleanLink = page.locator('a[href="car_hub/index.html"]');
    const sampleLink = page.locator('a[href="car_hub_sample/index.html"]');
    await expect(cleanLink).toBeVisible();
    await expect(sampleLink).toBeVisible();
  });
});



