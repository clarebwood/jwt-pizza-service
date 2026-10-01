const request = require('supertest');
const app = require('../service');

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

let testFranchiseId;

afterEach(async () => {
if (testFranchiseId) {
await DB.deleteFranchise(testFranchiseId);
testFranchiseId = undefined;
}
});

test('get franchises', async () => {
const res = await request(app)
.get('/api/franchise');

expect(res.status).toBe(200);
expect(res.body).toHaveProperty('franchises');
expect(res.body).toHaveProperty('more');
expect(Array.isArray(res.body.franchises)).toBe(true);
expect(typeof res.body.more).toBe('boolean');
});

test('get user franchises', async () => {
  const admin = await createAdminUser();

  const loginRes = await request(app).put('/api/auth').send({email: admin.email,password: admin.password,});

  const franchise = {name: `test franchise ${randomName()}`,admins: [{ email: admin.email }],};

  const createRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);

  expect(createRes.status).toBe(200);

  const getRes = await request(app).get(`/api/franchise/${admin.id}`).set('Authorization', `Bearer ${loginRes.body.token}`);

  expect(getRes.status).toBe(200);
  testFranchiseId = createRes.body.id;
  expect(getRes.body).toEqual(expect.arrayContaining([expect.objectContaining({id: createRes.body.id, name: franchise.name,}),]));
});



test('create store', async () => {
  const admin = await createAdminUser();

  const loginRes = await request(app).put('/api/auth').send({ email: admin.email, password: admin.password });

  const franchise = { name: `test franchise ${randomName()}`, admins: [{ email: admin.email }] };
  
  const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);

  expect(createFranchiseRes.status).toBe(200);

  testFranchiseId = createFranchiseRes.body.id;

  const store = {name: `test store ${randomName()}`,};

  const createStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${loginRes.body.token}`).send(store);

  expect(createStoreRes.status).toBe(200);
  expect(createStoreRes.body).toMatchObject({franchiseId: testFranchiseId, name: store.name,});
});

test('not authorized to create franchise', async () => {
  const franchise = {name: `test franchise ${randomName()}`, admins: [{ email: testUser.email }],};
  const res = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testUserAuthToken}`).send(franchise);

  expect(res.status).toBe(403);
});

test('not authorized to create a store', async () => {
  const admin = await createAdminUser();
  const loginAdminRes = await request(app).put('/api/auth').send({email: admin.email, password: admin.password,});
  const franchise = {name: `test franchise ${randomName()}`, admins: [{ email: admin.email }],};
  const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginAdminRes.body.token}`).send(franchise);

  expect(createFranchiseRes.status).toBe(200);

  testFranchiseId = createFranchiseRes.body.id;

  const store = {name: `test store ${randomName()}`,};
  const createStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${testUserAuthToken}`).send(store);

  expect(createStoreRes.status).toBe(403);
});

test('delete franchise', async () => {
  const admin = await createAdminUser();
  const loginRes = await request(app).put('/api/auth').send({email: admin.email, password: admin.password,});
  const franchise = {name: `test franchise ${randomName()}`, admins: [{ email: admin.email }],};
  const createRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);

  expect(createRes.status).toBe(200);

  testFranchiseId = createRes.body.id;

  const deleteRes = await request(app).delete(`/api/franchise/${testFranchiseId}`);

  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body).toEqual({message: 'franchise deleted',});

  testFranchiseId = undefined;
});

test('unauthorized to delete store', async () => {
  const admin = await createAdminUser();

  const loginAdminRes = await request(app).put('/api/auth').send({email: admin.email,password: admin.password,});

  const franchise = { name: `test franchise ${randomName()}`, admins: [{ email: admin.email }] };

  const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginAdminRes.body.token}`).send(franchise);

  expect(createFranchiseRes.status).toBe(200);

  testFranchiseId = createFranchiseRes.body.id;

  const store = {name: `test store ${randomName()}`};
  const createStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${loginAdminRes.body.token}`).send(store);

  expect(createStoreRes.status).toBe(200);

  const deleteStoreRes = await request(app).delete(`/api/franchise/${testFranchiseId}/store/${createStoreRes.body.id}`).set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(deleteStoreRes.status).toBe(403);
});

test('delete store', async () => {
  const admin = await createAdminUser();
  const loginRes = await request(app).put('/api/auth').send({ email: admin.email, password: admin.password });
  const franchise = { name: `test franchise ${randomName()}`, admins: [{ email: admin.email }] };
  const createFranchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);

  expect(createFranchiseRes.status).toBe(200);

  testFranchiseId = createFranchiseRes.body.id;

  const store = { name: `test store ${randomName()}` };
  const createStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${loginRes.body.token}`).send(store);

  expect(createStoreRes.status).toBe(200);

  const deleteStoreRes = await request(app).delete(`/api/franchise/${testFranchiseId}/store/${createStoreRes.body.id}`).set('Authorization', `Bearer ${loginRes.body.token}`);

  expect(deleteStoreRes.status).toBe(200);
  expect(deleteStoreRes.body).toEqual({ message: 'store deleted' });
});