import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { AppLayout } from "./components/app-layout";

const rootRoute = createRootRoute({ component: AppLayout });

const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/live",
  component: lazyRouteComponent(() => import("./pages/live-page"), "LivePage"),
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("./pages/library-page"),
    "LibraryPage",
  ),
});

const libraryAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const movieRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/$movieId",
  component: lazyRouteComponent(
    () => import("./pages/movie-page"),
    "MoviePage",
  ),
});

const movieSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/$movieId/settings",
  component: lazyRouteComponent(
    () => import("./pages/movie-page"),
    "MovieSettingsPage",
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("./pages/settings-page"),
    "SettingsPage",
  ),
});

const routeTree = rootRoute.addChildren([
  liveRoute,
  libraryRoute,
  libraryAliasRoute,
  movieRoute,
  movieSettingsRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 30_000,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
