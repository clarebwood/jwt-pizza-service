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
  testUser.id = registerRes.body.user.id;
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

test('update user', async () => {
  const updatedName = `updated user ${randomName()}`;

  const updateRes = await request(app).put(`/api/user/${testUser.id}`).set('Authorization', `Bearer ${testUserAuthToken}`) .send({
      name: updatedName,
      email: testUser.email,
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.user).toMatchObject({
    id: testUser.id,
    name: updatedName,
    email: testUser.email,
    roles: [{ role: 'diner' }],
  });

  expect(updateRes.body.user.password).toBeUndefined();
  expectValidJwt(updateRes.body.token);
});

test('admin update user', async () => {
  const admin = await createAdminUser();

  const loginRes = await request(app).put('/api/auth').send({
      email: admin.email,
      password: admin.password,
    });

  expect(loginRes.status).toBe(200);

  const updatedName = `updated by admin ${randomName()}`;

  const updateRes = await request(app).put(`/api/user/${testUser.id}`).set('Authorization', `Bearer ${loginRes.body.token}`).send({
      name: updatedName,
      email: testUser.email,
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.user).toMatchObject({
    id: testUser.id,
    name: updatedName,
    email: testUser.email,
    roles: [{ role: 'diner' }],
  });
  expect(updateRes.body.user.password).toBeUndefined();
  expectValidJwt(updateRes.body.token);
});