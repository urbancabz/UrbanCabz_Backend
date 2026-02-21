const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DIRECT_URL // Using DIRECT_URL to avoid port 6543 blocking issues
        }
    }
});

async function main() {
    try {
        console.log("Connecting to database...");

        // Ensure admin role exists
        let adminRole = await prisma.role.findUnique({
            where: { name: 'admin' }
        });

        if (!adminRole) {
            console.log("Admin role not found, creating it...");
            adminRole = await prisma.role.create({
                data: { name: 'admin' }
            });
        }

        const email = 'urbancabz03@gmail.com';
        const plainPassword = 'Urbancabz@03';
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        console.log("Checking if user already exists...");
        let user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            console.log("User already exists, updating password and role...");
            user = await prisma.user.update({
                where: { email },
                data: {
                    password_hash: passwordHash,
                    role_id: adminRole.id,
                    is_verified: true,
                    name: 'Admin'
                }
            });
        } else {
            console.log("Creating new admin user...");
            user = await prisma.user.create({
                data: {
                    email,
                    password_hash: passwordHash,
                    role_id: adminRole.id,
                    is_verified: true,
                    name: 'Admin',
                    is_first_login: false
                }
            });
        }

        console.log(`Successfully created/updated admin user: ${user.email}`);
    } catch (error) {
        console.error("Error creating admin user:", error);
    } finally {
        await prisma.$disconnect();
        console.log("Disconnected.");
    }
}

// Ensure environment variables are loaded if running standalone
require('dotenv').config();
main();
