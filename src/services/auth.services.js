// src/services/auth.service.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

async function register({ email, password, name, phone, roleName = 'customer' }) {
  // check existing
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw { status: 409, message: 'Email already registered' };

  // find role
  let role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    // fallback create role (rare)
    role = await prisma.role.create({ data: { name: roleName } });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      phone,
      roleId: role.id,
    },
    select: {
      id: true, email: true, name: true, phone: true, roleId: true, createdAt: true
    }
  });

  const token = signToken({ userId: user.id, role: role.name });

  return { user, token };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true }});
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  if (!user.passwordHash) throw { status: 401, message: 'No password set for this user' };

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw { status: 401, message: 'Invalid credentials' };

  // update last login
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }});

  const token = signToken({ userId: user.id, role: user.role?.name || 'customer' });

  // return user public fields + token
  const publicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role?.name || null
  };

  return { user: publicUser, token };
}

module.exports = { register, login };
