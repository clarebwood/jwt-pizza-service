const express = require('express');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const { authRouter, setAuth } = require('./authRouter.js');
const config = require('../config.js');

const userRouter = express.Router();

userRouter.docs = [
  {
    method: 'GET',
    path: '/api/user/me',
    requiresAuth: true,
    description: 'Get authenticated user',
    example: `curl -X GET localhost:3000/api/user/me -H 'Authorization: Bearer tttttt'`,
    response: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
  },
  {
    method: 'PUT',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Update user',
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
  {
    method: 'DELETE',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Delete a user (admin only)',
    example: `curl -X DELETE localhost:3000/api/user/1 -H 'Authorization: ******'`,
    response: { message: 'user deleted' },
  },
  {
    method: 'GET',
    path: '/api/user?page=1&limit=10&name=*',
    requiresAuth: true,
    description: 'Gets a paginated list of users filtered by name (admin only)',
    example: `curl -X GET 'localhost:3000/api/user?page=1&limit=10&name=*' -H 'Authorization: ******'`,
    response: {
      users: [{ id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }],
      more: false,
    },
  },
];

// getUser
userRouter.get(
  '/me',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

// updateUser
userRouter.put(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;
    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const updatedUser = await DB.updateUser(userId, name, email, password);
    const auth = await setAuth(updatedUser);
    res.json({ user: updatedUser, token: auth });
  })
);

// deleteUser
userRouter.delete(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const userId = parsePositiveInteger(req.params.userId);
    if (userId === null) {
      return res.status(400).json({ message: 'userId must be a positive integer' });
    }

    const deleted = await DB.deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ message: 'unknown user' });
    }
    res.json({ message: 'user deleted' });
  })
);

// listUsers
userRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const page = parsePositiveInteger(req.query.page ?? '1');
    const limit = parsePositiveInteger(req.query.limit ?? String(config.db.listPerPage));
    const name = req.query.name ?? '*';
    if (page === null || limit === null || typeof name !== 'string') {
      return res.status(400).json({ message: 'page and limit must be positive integers and name must be a string' });
    }

    const { users, more } = await DB.getUsers(page, limit, name);
    res.json({ users, more });
  }),
);

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

module.exports = userRouter;
