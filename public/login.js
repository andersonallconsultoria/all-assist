document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.getElementById("loginMessage");
  message.textContent = "Entrando...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password")
      })
    });

    if (!response.ok) {
      message.textContent = "Email ou senha invalidos.";
      return;
    }

    const payload = await response.json();
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    const safeNext = next.startsWith("/") ? next : "/";
    const isMaster = payload.user?.role?.key === "master" || payload.user?.permissions?.includes("support:tenants");

    window.location.href = isMaster && safeNext === "/" ? "/master.html" : safeNext;
  } catch (error) {
    message.textContent = "Nao foi possivel acessar agora.";
  }
});
