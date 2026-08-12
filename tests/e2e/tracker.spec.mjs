import { test, expect } from '@playwright/test';

const card={id:'card-1',set_id:'origins',group_name:'Fury',card_name:'Test Card',
  collector_number:'001/298',variant:'Regular',source:'Booster',price:'1.25',
  status:'Released',image_url:'',quantity:1};

async function mockDatabase(page,{editor=false}={}){
  await page.route('https://ekyngjwtoxvkqfalxebm.supabase.co/rest/v1/riftbound_card_main**',route=>{
    if(route.request().method()==='PATCH') return route.fulfill({status:204,body:''});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([card])});
  });
  await page.route('https://ekyngjwtoxvkqfalxebm.supabase.co/rest/v1/rpc/is_collection_editor',route=>
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(editor)}));
  await page.route('https://ekyngjwtoxvkqfalxebm.supabase.co/rest/v1/riftbound_card_quantity_history**',route=>
    route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.route('https://ekyngjwtoxvkqfalxebm.supabase.co/auth/v1/user',route=>
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({email:'editor@example.com'})}));
}

test('home lists all four released sets', async ({page}) => {
  await mockDatabase(page);
  await page.goto('/index.html');
  await expect(page.locator('.setcard')).toHaveCount(4);
  await expect(page.getByRole('img',{name:'Origins',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Vendetta',exact:true})).toBeVisible();
});

test('Origins tracker loads cards from Supabase', async ({page}) => {
  await mockDatabase(page);
  await page.goto('/tracker.html?set=origins');
  await expect(page.locator('#fallbackName')).toHaveText('Origins');
  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.getByText('Test Card')).toBeVisible();
});

test('allowlisted editor can save a quantity', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('riftbound-tracker:supabase-session',JSON.stringify({
    access_token:'token',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600,
  })));
  await mockDatabase(page,{editor:true});
  await page.goto('/tracker.html?set=origins');
  await expect(page.getByText('editor@example.com')).toBeVisible();
  const request=page.waitForRequest(req=>req.url().includes('/rest/v1/riftbound_card_main?id=eq.card-1')&&req.method()==='PATCH');
  await page.getByRole('button',{name:'Add one Test Card'}).click();
  await request;
  await expect(page.locator('.qtyedit output')).toHaveText('2');
});
