const request = require('supertest');
const app = require('../service');

global.fetch = jest.fn();

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

const { Role, DB } = require('../database/database.js');

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function deleteTestOrder(orderId) {
  const connection = await DB.getConnection();

  try {
    await DB.query(
      connection,
      'DELETE FROM orderItem WHERE orderId=?',
      [orderId]
    );

    await DB.query(
      connection,
      'DELETE FROM dinerOrder WHERE id=?',
      [orderId]
    );
  } finally {
    connection.end();
  }
}

async function deleteTestMenuItem(menuItemId) {
  const connection = await DB.getConnection();

  try {
    await DB.query(
      connection,
      'DELETE FROM menu WHERE id=?',
      [menuItemId]
    );
  } finally {
    connection.end();
  }
}

let testOrderId;
let testMenuItemId;
let testFranchiseId;


afterEach(async () => {
  if (testOrderId) {
    await deleteTestOrder(testOrderId);
    testOrderId = undefined;
  }

  if (testMenuItemId) {
    await deleteTestMenuItem(testMenuItemId);
    testMenuItemId = undefined;
  }

  if (testFranchiseId) {
    await DB.deleteFranchise(testFranchiseId);
    testFranchiseId = undefined;
  }
});




test('get menu', async () => {
  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('admin add menu item', async () => {
  const admin = await createAdminUser();
  const loginRes = await request(app).put('/api/auth').send({email: admin.email, password: admin.password,});
  const menuItem = {title: `Test Pizza ${randomName()}`,description: 'Test pizza description',image: 'test.png',price: 5.99,};
  const res = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${loginRes.body.token}`).send(menuItem);

  expect(res.status).toBe(200);

  const createdMenuItem = res.body.find((item) => item.title === menuItem.title);

  expect(createdMenuItem).toBeDefined();
  expect(createdMenuItem).toMatchObject({title: menuItem.title, description: menuItem.description, image: menuItem.image, price: menuItem.price,});

  testMenuItemId = createdMenuItem.id;
});


test('get orders', async () => {
  const res = await request(app).get('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('dinerId');
  expect(res.body).toHaveProperty('orders');
  expect(res.body).toHaveProperty('page');

  expect(res.body.dinerId).toBeDefined();
  expect(Array.isArray(res.body.orders)).toBe(true);
});

test('get orders authentication', async () => {
  const res = await request(app).get('/api/order');

  expect(res.status).toBe(401);
  expect(res.body).toEqual({message: 'unauthorized',});
});

test('create order', async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      reportUrl: 'http://fake-report',
      jwt: 'fake-jwt',
    }),
  });

  const admin = await createAdminUser();
  const loginRes = await request(app).put('/api/auth').send({email: admin.email, password: admin.password,});
  const franchise = {name: `test franchise ${randomName()}`, admins: [{ email: admin.email }],};
  const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);

  expect(createFranchiseRes.status).toBe(200);

  testFranchiseId = createFranchiseRes.body.id;

  const createStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${loginRes.body.token}`).send({name: `test store ${randomName()}`,});

  expect(createStoreRes.status).toBe(200);

  const menuItem = {title: `Test Pizza ${randomName()}`,description: 'Test pizza',image: 'test.png',price: 5.99,};

  const menuItemRes = await DB.addMenuItem(menuItem);
  testMenuItemId = menuItemRes.id;

  const order = {
    franchiseId: testFranchiseId,
    storeId: createStoreRes.body.id,
    items: [{
      menuId: menuItemRes.id,
      description: menuItem.description,
      price: menuItem.price,
    }],
  };

  const res = await request(app).post('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`).send(order);

  expect(res.status).toBe(200);
  expect(res.body.order).toMatchObject(order);
  expect(res.body.followLinkToEndChaos).toBe('http://fake-report');
  expect(res.body.jwt).toBe('fake-jwt');

  testOrderId = res.body.order.id;
});
