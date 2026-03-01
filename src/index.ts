import "dotenv/config";
import app from './app.ts';

const PORT = process.env.PORT || 7492;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
