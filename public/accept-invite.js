document.getElementById("acceptInviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.getElementById("acceptInviteMessage");
  const token = new URLSearchParams(window.location.search).get("token") || "";

  message.textContent = "Criando acesso...";

  try {
    const response = await fetch("/api/auth/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token,
        name: form.get("name"),
        password: form.get("password")
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      message.textContent = payload.error || "Nao foi possivel aceitar o convite.";
      return;
    }

    message.textContent = "Acesso criado. Validando email...";
    window.location.href = `/verify-email.html?token=${encodeURIComponent(payload.verificationToken)}`;
  } catch {
    message.textContent = "Nao foi possivel aceitar o convite agora.";
  }
});
