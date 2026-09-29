import { expect, test, type Page } from '@playwright/test';

async function demo(page: Page, name: RegExp) {
  await page.goto('/login');
  await page.getByRole('button', { name }).click();
  await page.waitForURL('**/overview');
}

test('a member finishes the last step and the task celebrates', async ({ page }) => {
  await demo(page, /Omar Al-Shehri/);
  await page.getByRole('button', { name: /Quarterly backup restore drill/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('4 of 5 steps')).toBeVisible();
  await dialog.getByRole('checkbox', { checked: false }).click();
  await expect(dialog.getByText('5 of 5 steps')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Task completed' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status').getByText(/Task completed in/)).toBeVisible();
});

test('members cannot manage tasks or reach HR pages', async ({ page }) => {
  await demo(page, /Omar Al-Shehri/);
  await expect(page.getByRole('link', { name: 'Employees' })).toHaveCount(0);
  await page.goto('/employees');
  await page.waitForURL('**/overview');
  await page.getByRole('button', { name: /Renew SSL certificates/ }).first().click();
  await expect(page.getByRole('button', { name: 'Delete task' })).toHaveCount(0);
});

test("other departments' completed work is restricted", async ({ page }) => {
  await demo(page, /Omar Al-Shehri/);
  await page.getByRole('link', { name: 'Completed work' }).click();
  await page.getByRole('button', { name: 'All departments' }).click();
  const row = page.getByRole('row', { name: /National Day campaign/ });
  await expect(row.getByText('Restricted').first()).toBeVisible();
  await expect(row.getByText('6 days')).toBeVisible();
});

test('Arabic switches the whole layout to right-to-left', async ({ page }) => {
  await demo(page, /Reem Al-Otaibi/);
  await page.getByRole('button', { name: 'Switch language to Arabic' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'مهام الإدارة' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('a head creates a task and the assignee sees it live', async ({ browser }) => {
  const head = await browser.newPage();
  const member = await browser.newPage();
  await demo(member, /Omar Al-Shehri/);
  await member.getByRole('link', { name: 'My tasks' }).click();
  await demo(head, /Reem Al-Otaibi/);
  await head.getByRole('button', { name: 'New task' }).first().click();
  await head.getByLabel('Title').fill('Patch the VPN appliance');
  await head.getByRole('dialog').locator('label', { hasText: 'Omar Al-Shehri' }).click();
  await head.getByLabel('Step 1', { exact: true }).fill('Download the patch');
  await head.getByRole('button', { name: 'Create task' }).click();
  await expect(head.getByRole('status').getByText('Task created and assigned')).toBeVisible();
  await expect(member.getByRole('button', { name: /Patch the VPN appliance/ })).toBeVisible({ timeout: 10_000 });
});

test('wrong credentials show one plain message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Employee ID').fill('WDA-10482');
  await page.getByLabel('Password or activation code').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.form-err')).toContainText("don't match an active account");
});

test('a head attaches a file while creating a task', async ({ page }) => {
  await demo(page, /Reem Al-Otaibi/);
  await page.getByRole('button', { name: 'New task' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Title').fill('Review the network diagram');
  await form.locator('label', { hasText: 'Sara Al-Dosari' }).click();
  await form.getByLabel('Step 1', { exact: true }).fill('Check the diagram');
  await form.locator('.dropzone input[type=file]').setInputFiles({ name: 'diagram.txt', mimeType: 'text/plain', buffer: Buffer.from('core switch → firewall') });
  await expect(form.getByText('diagram.txt')).toBeVisible();
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('status').getByText('Task created and assigned')).toBeVisible();
  await page.getByRole('button', { name: /Review the network diagram/ }).first().click();
  await expect(page.getByRole('dialog').getByText('diagram.txt')).toBeVisible();
});

test('a file can be attached to a single step', async ({ page }) => {
  await demo(page, /Reem Al-Otaibi/);
  await page.getByRole('button', { name: 'New task' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Title').fill('Update the floor plan');
  await form.locator('label', { hasText: 'Omar Al-Shehri' }).click();
  await form.getByLabel('Step 1', { exact: true }).fill('Measure the rooms');
  await form.getByLabel('Step 2', { exact: true }).fill('Draw the plan');
  const chooser = page.waitForEvent('filechooser');
  await form.getByRole('button', { name: /Attach files to .Draw the plan/ }).click();
  await (await chooser).setFiles({ name: 'sketch.txt', mimeType: 'text/plain', buffer: Buffer.from('rooms') });
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('status').getByText('Task created and assigned')).toBeVisible();
  await page.getByRole('button', { name: /Update the floor plan/ }).first().click();
  const step = page.getByRole('dialog').locator('.step-wrap', { hasText: 'Draw the plan' });
  await expect(step.getByText('sketch.txt')).toBeVisible();
});
