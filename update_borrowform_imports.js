const fs = require('fs');
const path = 'C:/Users/Lenovo/Downloads/OLMS Copilot/frontend/src/pages/Transactions/BorrowForm.js';
let content = fs.readFileSync(path, 'utf8');

const oldBlock = `  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Avatar,`;

const newBlock = `  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Autocomplete,
  IconButton,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,`;

if (!content.includes(oldBlock)) {
  console.error('old block not found');
  process.exit(1);
}

content = content.replace(oldBlock, newBlock);

const oldIcons = `{
  Add,
  Remove,
  Search,
  Person,
  Book,
  QrCodeScanner,
  Assignment,
  Warning,
  CheckCircle,
  ArrowBack,
  Print,
  Save,
}`;
const newIcons = `{ Remove, Search, Book, ArrowBack, Assignment }`;
content = content.replace(oldIcons, newIcons);

fs.writeFileSync(path, content);
