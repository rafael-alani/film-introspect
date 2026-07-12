import { Avatar, Loader, Menu, Text, UnstyledButton } from "@mantine/core";
import {
  IconBook2,
  IconChevronDown,
  IconLogout,
  IconPlayerPlay,
  IconSettings,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { authClient } from "../api/auth";
import { api } from "../api/client";
import { AuthScreen } from "./auth-screen";
import { Brand } from "./brand";

const navItems = [
  { to: "/", label: "Live", icon: IconPlayerPlay },
  { to: "/library", label: "Library", icon: IconBook2 },
  { to: "/settings", label: "Settings", icon: IconSettings },
] as const;

function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/\s+|@/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppLayout() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ["app-config"],
    queryFn: api.config,
    staleTime: Infinity,
  });
  const session = authClient.useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const nextUserId = session.data?.user.id ?? null;
    if (
      previousUserId.current !== null &&
      previousUserId.current !== nextUserId
    )
      queryClient.clear();
    previousUserId.current = nextUserId;
  }, [queryClient, session.data?.user.id]);

  const authEnabled = config.data?.authEnabled ?? true;

  if (config.isPending || (authEnabled && session.isPending)) {
    return (
      <div className="app-loading">
        <Brand />
        <Loader color="amber" size="sm" />
      </div>
    );
  }

  if (authEnabled && !session.data) return <AuthScreen />;

  const user = session.data?.user ?? {
    id: "local",
    name: "Local viewer",
    email: "Prototype mode",
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={pathname === to ? "nav-link active" : "nav-link"}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Menu position="bottom-end" width={220}>
          <Menu.Target>
            <UnstyledButton className="user-menu-button">
              <Avatar size={31} radius="xl" color="amber">
                {initials(user.name, user.email)}
              </Avatar>
              <Text size="sm" fw={600} className="user-name">
                {user.name || user.email}
              </Text>
              <IconChevronDown size={14} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {authEnabled
                ? user.email
                : "Local prototype · app login disabled"}
            </Menu.Label>
            <Menu.Item
              leftSection={<IconSettings size={15} />}
              onClick={() => void navigate({ to: "/settings" })}
            >
              Settings
            </Menu.Item>
            {authEnabled && (
              <>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={15} />}
                  onClick={() => {
                    queryClient.clear();
                    void authClient.signOut();
                  }}
                >
                  Sign out
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={
              pathname === to ? "mobile-nav-link active" : "mobile-nav-link"
            }
          >
            <Icon size={20} stroke={1.7} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
