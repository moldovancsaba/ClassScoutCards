import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ 
    name: "ClassScout Cards API",
    version: "1.0.0",
    endpoints: [
      "/api/generate",
      "/api/status",
      "/api/history"
    ]
  });
}
