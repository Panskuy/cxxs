-- CreateTable
CREATE TABLE "GithubLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubLink_userId_key" ON "GithubLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubLink_githubId_key" ON "GithubLink"("githubId");

-- AddForeignKey
ALTER TABLE "GithubLink" ADD CONSTRAINT "GithubLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
