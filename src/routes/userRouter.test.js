const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

const createdUserIds = new Set();

afterEach(async () => {
  try {
    await Promise.all([...createdUserIds].map((userId) => DB.deleteUser(userId)));
  } finally {
    createdUserIds.clear();
  }
});

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function registerUser(name = `pizza diner ${randomName()}`) {
  const newUser = {
    name,
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const response = await request(app).post('/api/auth').send(newUser);
  expect(response.status).toBe(200);
  createdUserIds.add(response.body.user.id);
  return { ...response.body.user, password: newUser.password, token: response.body.token };
}

async function createAdmin() {
  const name = `admin ${randomName()}`;
  const user = await DB.addUser({
    name,
    email: `${randomName()}@admin.com`,
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  });
  createdUserIds.add(user.id);
  const login = await request(app).put('/api/auth').send({
    email: user.email,
    password: 'toomanysecrets',
  });
  expect(login.status).toBe(200);
  return { ...login.body.user, token: login.body.token };
}

function authorize(token) {
  return `Bearer ${token}`;
}

function expectValidJwt(token) {
  expect(token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

test('a user can update their own profile', async () => {
  const user = await registerUser();
  const updatedName = `updated user ${randomName()}`;
  const response = await request(app)
    .put(`/api/user/${user.id}`)
    .set('Authorization', authorize(user.token))
    .send({ name: updatedName, email: user.email });

  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: user.id,
    name: updatedName,
    email: user.email,
    roles: [{ role: Role.Diner }],
  });
  expect(response.body.user.password).toBeUndefined();
  expectValidJwt(response.body.token);
});

test('a user can change their email and password', async () => {
  const user = await registerUser();
  const updatedEmail = `${randomName()}@test.com`;
  const updatedPassword = `new-${randomName()}`;
  const updateResponse = await request(app)
    .put(`/api/user/${user.id}`)
    .set('Authorization', authorize(user.token))
    .send({ name: user.name, email: updatedEmail, password: updatedPassword });
  const loginResponse = await request(app).put('/api/auth').send({
    email: updatedEmail,
    password: updatedPassword,
  });

  expect(updateResponse.status).toBe(200);
  expect(updateResponse.body.user.email).toBe(updatedEmail);
  expect(updateResponse.body.user.password).toBeUndefined();
  expectValidJwt(updateResponse.body.token);
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.user.id).toBe(user.id);
});

test('an admin can update another user', async () => {
  const admin = await createAdmin();
  const user = await registerUser();
  const updatedName = `admin updated ${randomName()}`;
  const response = await request(app)
    .put(`/api/user/${user.id}`)
    .set('Authorization', authorize(admin.token))
    .send({ name: updatedName, email: user.email });

  expect(response.status).toBe(200);
  expect(response.body.user).toMatchObject({
    id: user.id,
    name: updatedName,
    email: user.email,
    roles: [{ role: Role.Diner }],
  });
  expect(response.body.user.password).toBeUndefined();
  expectValidJwt(response.body.token);
});

test('users cannot update another user', async () => {
  const firstUser = await registerUser();
  const secondUser = await registerUser();
  const response = await request(app)
    .put(`/api/user/${secondUser.id}`)
    .set('Authorization', authorize(firstUser.token))
    .send({ name: 'not allowed' });

  expect(response.status).toBe(403);
});

test('listing users requires authentication and admin role', async () => {
  const user = await registerUser();
  const unauthenticatedResponse = await request(app).get('/api/user');
  const nonAdminResponse = await request(app)
    .get('/api/user')
    .set('Authorization', authorize(user.token));

  expect(unauthenticatedResponse.status).toBe(401);
  expect(nonAdminResponse.status).toBe(403);
});

test('an admin can list users with their roles but no passwords', async () => {
  const admin = await createAdmin();
  const user = await registerUser();
  const response = await request(app)
    .get('/api/user')
    .query({ name: user.name })
    .set('Authorization', authorize(admin.token));

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('users');
  expect(response.body).toHaveProperty('more');
  expect(typeof response.body.more).toBe('boolean');
  expect(response.body.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
        roles: [{ role: Role.Diner }],
      }),
    ])
  );
  expect(response.body.users.every((listedUser) => listedUser.password === undefined)).toBe(true);
});

test('user listing filters by name and paginates', async () => {
  const admin = await createAdmin();
  const prefix = `filter ${randomName()}`;
  const names = [`${prefix} one`, `${prefix} two`, `${prefix} three`];
  for (const name of names) {
    await registerUser(name);
  }

  const firstPage = await request(app)
    .get('/api/user')
    .query({ page: 1, limit: 2, name: `${prefix}*` })
    .set('Authorization', authorize(admin.token));
  const secondPage = await request(app)
    .get('/api/user')
    .query({ page: 2, limit: 2, name: `${prefix}*` })
    .set('Authorization', authorize(admin.token));

  expect(firstPage.status).toBe(200);
  expect(firstPage.body.users.map((user) => user.name)).toEqual(names.slice(0, 2));
  expect(firstPage.body.more).toBe(true);
  expect(secondPage.status).toBe(200);
  expect(secondPage.body.users.map((user) => user.name)).toEqual(names.slice(2));
  expect(secondPage.body.more).toBe(false);
});

test('user listing rejects invalid pagination parameters', async () => {
  const admin = await createAdmin();
  const response = await request(app)
    .get('/api/user?page=0&limit=10')
    .set('Authorization', authorize(admin.token));

  expect(response.status).toBe(400);
});

test('only an admin can delete users, and deletion revokes their tokens', async () => {
  const admin = await createAdmin();
  const user = await registerUser();
  const nonAdminResponse = await request(app)
    .delete(`/api/user/${user.id}`)
    .set('Authorization', authorize(user.token));

  expect(nonAdminResponse.status).toBe(403);

  const deleteResponse = await request(app)
    .delete(`/api/user/${user.id}`)
    .set('Authorization', authorize(admin.token));
  const revokedTokenResponse = await request(app)
    .get('/api/user/me')
    .set('Authorization', authorize(user.token));

  expect(deleteResponse.status).toBe(200);
  expect(deleteResponse.body).toEqual({ message: 'user deleted' });
  expect(revokedTokenResponse.status).toBe(401);
});

test('admin delete reports an unknown user', async () => {
  const admin = await createAdmin();
  const response = await request(app)
    .delete('/api/user/2147483647')
    .set('Authorization', authorize(admin.token));

  expect(response.status).toBe(404);
});
