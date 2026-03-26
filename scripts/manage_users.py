#!/usr/bin/env python3
"""MemoClaw user management CLI — create, reset, and list web UI users.

Usage:
    python -m scripts.manage_users create <username> <password>
    python -m scripts.manage_users reset <username> <new_password>
    python -m scripts.manage_users list
    python -m scripts.manage_users delete <username>

Can also be run via: docker compose exec memoclaw python scripts/manage_users.py <command> <args>
"""

import sys
import asyncio

import bcrypt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Allow running as standalone or from project root
sys.path.insert(0, ".")


async def get_engine():
    """Create DB engine from env or default."""
    import os
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://memoclaw:memoclaw@localhost:5433/memoclaw"
    )
    return create_async_engine(url)


async def create_user(username: str, password: str):
    """Create a new web UI user."""
    engine = await get_engine()
    async with async_sessionmaker(engine, class_=AsyncSession)() as session:
        # Check if user exists
        result = await session.execute(
            text("SELECT id FROM web_users WHERE username = :u"), {"u": username}
        )
        if result.scalar():
            print(f"❌ User '{username}' already exists. Use 'reset' to change password.")
            return False

        pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await session.execute(
            text("INSERT INTO web_users (id, username, password_hash, is_active, created_at, updated_at) "
                 "VALUES (gen_random_uuid(), :u, :pw, true, now(), now())"),
            {"u": username, "pw": pw_hash},
        )
        await session.commit()
        print(f"✅ User '{username}' created successfully.")
        return True
    await engine.dispose()


async def reset_password(username: str, new_password: str):
    """Reset a user's password."""
    engine = await get_engine()
    async with async_sessionmaker(engine, class_=AsyncSession)() as session:
        result = await session.execute(
            text("SELECT id FROM web_users WHERE username = :u"), {"u": username}
        )
        if not result.scalar():
            print(f"❌ User '{username}' not found.")
            return False

        pw_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await session.execute(
            text("UPDATE web_users SET password_hash = :pw, updated_at = now() WHERE username = :u"),
            {"u": username, "pw": pw_hash},
        )
        await session.commit()
        print(f"✅ Password for '{username}' has been reset.")
        return True
    await engine.dispose()


async def list_users():
    """List all web UI users."""
    engine = await get_engine()
    async with async_sessionmaker(engine, class_=AsyncSession)() as session:
        result = await session.execute(
            text("SELECT username, is_active, created_at FROM web_users ORDER BY created_at")
        )
        rows = result.fetchall()
        if not rows:
            print("No users found.")
            return

        print(f"\n{'Username':<20} {'Active':<10} {'Created'}")
        print("-" * 55)
        for row in rows:
            print(f"{row[0]:<20} {'✅' if row[1] else '❌':<10} {row[2]}")
        print()
    await engine.dispose()


async def delete_user(username: str):
    """Delete a web UI user."""
    engine = await get_engine()
    async with async_sessionmaker(engine, class_=AsyncSession)() as session:
        result = await session.execute(
            text("DELETE FROM web_users WHERE username = :u RETURNING id"), {"u": username}
        )
        if not result.scalar():
            print(f"❌ User '{username}' not found.")
            return False

        await session.commit()
        print(f"✅ User '{username}' deleted.")
        return True
    await engine.dispose()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "create":
        if len(sys.argv) != 4:
            print("Usage: manage_users.py create <username> <password>")
            sys.exit(1)
        asyncio.run(create_user(sys.argv[2], sys.argv[3]))

    elif cmd == "reset":
        if len(sys.argv) != 4:
            print("Usage: manage_users.py reset <username> <new_password>")
            sys.exit(1)
        asyncio.run(reset_password(sys.argv[2], sys.argv[3]))

    elif cmd == "list":
        asyncio.run(list_users())

    elif cmd == "delete":
        if len(sys.argv) != 3:
            print("Usage: manage_users.py delete <username>")
            sys.exit(1)
        asyncio.run(delete_user(sys.argv[2]))

    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
