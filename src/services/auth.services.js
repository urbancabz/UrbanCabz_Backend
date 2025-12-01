// src/services/auth.service.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

function toPublicUser(user, roleName) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: roleName || user.role?.name || null
  };
}

async function register({ email,password, name, phone, roleName = 'customer' }) {
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
      password_hash: passwordHash,
      name,
      phone,
      role_id: role.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: {
        select: {
          name: true
        }
      }
    }
  });

  const token = signToken({ userId: user.id, role: role.name });

  return { user: toPublicUser(user, role.name), token };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ 
    where: { email }, 
    select: {
      id: true,
      email: true,
      password_hash: true,  // Explicitly select password_hash
      name: true,
      phone: true,
      role_id: true,
      role: {
        select: {
          name: true
        }
      }
    }
  });
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  if (!user.password_hash) throw { status: 401, message: 'No password set for this user' };

  const ok = await bcrypt.compare(password, user.password_hash);  // Fixed: use password_hash
  if (!ok) throw { status: 401, message: 'Invalid credentials' };

  // Note: Remove or fix the lastLoginAt update if that field doesn't exist in your schema
  // await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }});

  const token = signToken({ userId: user.id, role: user.role?.name || 'customer' });

  // return user public fields + token
  return { user: toPublicUser(user), token };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: {
        select: { name: true }
      }
    }
  });

  if (!user) throw { status: 404, message: 'User not found' };

  return { user: toPublicUser(user) };
}

async function updateProfile(userId, payload) {
  const data = {};
  if (typeof payload.name !== 'undefined') data.name = payload.name;
  if (typeof payload.phone !== 'undefined') data.phone = payload.phone;
  if (typeof payload.email !== 'undefined') {
    // ensure unique email
    const existing = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existing && existing.id !== userId) {
      throw { status: 409, message: 'Email already in use' };
    }
    data.email = payload.email;
  }

  if (Object.keys(data).length === 0) {
    return getProfile(userId);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: {
        select: { name: true }
      }
    }
  });

  return { user: toPublicUser(user) };
}

module.exports = { register, login, getProfile, updateProfile };
