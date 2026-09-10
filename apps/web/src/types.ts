export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "DEVELOPER";
  developer: null | {
    id: string;
    jobTitle: string | null;
    department: string | null;
  };
};

export type Developer = {
  id: string;
  jobTitle: string | null;
  department: string | null;
  timezone: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  _count: { statusReports: number };
};
