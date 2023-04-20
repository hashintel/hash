export const DEFAULT_PROMPT = "A calculator";

export const DEFAULT_OUTPUT = `
  const LoginForm = () => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log(\`Email: \${email}, Password: \${password}\`);
  };

  return (
    <MUI.Container maxWidth="xs">
      <MUI.Paper elevation={3} style={{ padding: "2rem" }}>
        <MUI.Typography variant="h4" align="center" gutterBottom>
          Login
        </MUI.Typography>
        <form onSubmit={handleSubmit}>
          <MUI.TextField
            label="Email"
            variant="outlined"
            fullWidth
            margin="normal"
            value={email}
            onChange={handleEmailChange}
          />
          <MUI.TextField
            label="Password"
            variant="outlined"
            fullWidth
            margin="normal"
            type="password"
            value={password}
            onChange={handlePasswordChange}
          />
          <MUI.Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
          >
            Login
          </MUI.Button>
        </form>
      </MUI.Paper>
    </MUI.Container>
  );
};

render(<LoginForm />);`;
