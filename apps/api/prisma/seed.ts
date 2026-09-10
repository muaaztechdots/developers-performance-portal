import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "muaaz@techdots.dev").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
  const passwordHash = await bcrypt.hash(password, 12);

  const existingAdmin =
    await prisma.user.findUnique({ where: { email } }) ??
    await prisma.user.findFirst({ where: { role: UserRole.ADMIN }, orderBy: { createdAt: "asc" } });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        email,
        passwordHash,
        isActive: true,
        role: UserRole.ADMIN,
        developer: {
          upsert: {
            create: { jobTitle: "Administrator", department: "Operations" },
            update: {}
          }
        }
      }
    });
  } else {
    await prisma.user.create({
      data: {
      email,
      passwordHash,
      firstName: "System",
      lastName: "Admin",
      role: UserRole.ADMIN,
      developer: {
        create: {
          jobTitle: "Administrator",
          department: "Operations"
        }
      }
      }
    });
  }

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
