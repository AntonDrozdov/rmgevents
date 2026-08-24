FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /workspace

COPY ServerEquipment.sln ./
COPY src/WebApi/WebApi.csproj src/WebApi/
COPY src/Api/Api.csproj src/Api/
COPY src/Infrastructure/Infrastructure.csproj src/Infrastructure/
COPY src/Application/Application.csproj src/Application/
RUN dotnet restore src/WebApi/WebApi.csproj

COPY src/ src/
RUN dotnet publish src/WebApi/WebApi.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "WebApi.dll"]
