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

  test('レビュー用「確認ポイント注記」の表示・非表示トグルが機能すること', async ({ page }) => {
    const toggleBtn = page.locator('#toggle-tips-btn');
    const firstTip = page.locator('.review-tip').first();

    // 初期状態: 表示中
    await expect(toggleBtn).toContainText('表示中');
    await expect(firstTip).toBeVisible();

    // クリック: 非表示になる
    await toggleBtn.click();
    await expect(toggleBtn).toContainText('非表示');
    await expect(firstTip).toBeHidden();

    // 再度クリック: 再表示される
    await toggleBtn.click();
    await expect(toggleBtn).toContainText('表示中');
    await expect(firstTip).toBeVisible();
  });

  test('赤入れモーダルの開閉とテンプレートテキストが正常であること', async ({ page }) => {
    const openModalBtn = page.locator('#open-feedback-modal-btn');
    const modal = page.locator('#feedback-modal');
    const closeModalBtn = page.locator('#close-modal-btn');
    const templateTextarea = page.locator('#feedback-template-text');

    // 初期状態: モーダル非表示
    await expect(modal).toBeHidden();

    // モーダルを開く
    await openModalBtn.click();
    await expect(modal).toBeVisible();

    // テンプレート内に理念や料金体系の項目が含まれていること
    const text = await templateTextarea.inputValue();
    expect(text).toContain('■ 1. コンセプト・理念');
    expect(text).toContain('■ 3. 料金体系・ビジネスモデル');
    expect(text).toContain('■ 6. 写真・画像素材');

    // 閉じるボタンで閉じる
    await closeModalBtn.click();
    await expect(modal).toBeHidden();
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
    expect(cleanedTexts).toContain('ご紹介事例');
    expect(cleanedTexts).toContain('ご紹介の流れ');
    expect(cleanedTexts).toContain('よくある質問');
    expect(cleanedTexts).toContain('運営会社について');

    // メニュー内のリンクをクリック: 閉じる
    await mobileMenu.locator('a').first().click();
    await expect(mobileMenu).toBeHidden();
  });
});

// ==========================================
// 2. 枠組み版 (sumaito/index.html) のテスト
// ==========================================
test.describe('枠組み版 LP (sumaito/index.html) の UI 操作テスト', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/sumaito/index.html');
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
