// Student Import Dialog Component
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  LinearProgress,
  Chip,
  IconButton,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { CloudUpload, GetApp, Check, Error, Close } from "@mui/icons-material";
import { studentsAPI, settingsAPI } from "../../utils/api";
import toast from "react-hot-toast";
import { ensureUserAttributes } from "../../utils/userAttributes";
import { downloadPDF } from "../../utils/pdfGenerator";

const StudentImportDialog = ({ open, onClose, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Results
  const [existingStudents, setExistingStudents] = useState([]);
  const [importSuccessful, setImportSuccessful] = useState(false);
  const [userAttributes, setUserAttributes] = useState(() =>
    ensureUserAttributes(),
  );
  const [attributeError, setAttributeError] = useState("");
  const [autoPrintCards, setAutoPrintCards] = useState(true); // Default to true for automatic printing

  const gradeOptions = userAttributes.gradeLevels;
  const sections = ["A", "B", "C", "D", "E"];

  useEffect(() => {
    if (!open) {
      return;
    }

    let isMounted = true;

    const loadAttributes = async () => {
      try {
        const response = await settingsAPI.getUserAttributes();
        if (isMounted) {
          setUserAttributes(ensureUserAttributes(response.data));
          setAttributeError("");
        }
      } catch (error) {
        console.error("Failed to load user attribute options:", error);
        if (isMounted) {
          setUserAttributes(ensureUserAttributes());
          setAttributeError(
            "Failed to load curriculum and grade options. Using defaults.",
          );
        }
      }
    };

    loadAttributes();

    return () => {
      isMounted = false;
    };
  }, [open]);

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile && uploadedFile.type === "text/csv") {
      setFile(uploadedFile);

      try {
        // Fetch existing students first
        const existingStudentsResponse = await studentsAPI.getAll();
        setExistingStudents(existingStudentsResponse.data.students || []);

        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          const rows = text.split("\n").filter((row) => row.trim());
          const headers = rows[0].split(",").map((h) => h.trim());

          const data = rows.slice(1).map((row, index) => {
            const values = row
              .split(",")
              .map((v) => v.trim().replace(/"/g, ""));
            const student = {};
            headers.forEach((header, i) => {
              student[header.toLowerCase().replace(/\s+/g, "")] =
                values[i] || "";
            });
            student.rowIndex = index + 2; // +2 because of 0-based index and header row
            return student;
          });

          setCsvData(data);
          setStep(2);
        };
        reader.readAsText(uploadedFile);
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Failed to load student data");
      }
    } else {
      toast.error("Please upload a valid CSV file");
    }
  };

  const downloadTemplate = () => {
    const sampleGradePrimary = gradeOptions[0] || "Grade 9";
    const sampleGradeSecondary = gradeOptions[1] || gradeOptions[0] || "Grade 10";
    const sampleSectionPrimary = sections[0] || "A";
    const sampleSectionSecondary = sections[1] || sections[0] || "A";
    const template = `firstName,lastName,middleName,email,phoneNumber,studentId,lrn,grade,section,barangay,municipality,province,fullAddress,parentGuardianName,parentPhone
John,Doe,Santos,john.doe@student.example.edu,09123456789,2024001,123456789012,${sampleGradePrimary},${sampleSectionPrimary},Barangay 1,Quezon City,Metro Manila,"123 Main St Barangay 1 Quezon City",Jane Doe,09987654321
Mary,Smith,Cruz,mary.smith@student.example.edu,09111222333,2024002,123456789013,${sampleGradeSecondary},${sampleSectionSecondary},Barangay 2,Manila,Metro Manila,"789 Pine St Barangay 2 Manila",Bob Smith,09444555666`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = "student_import_template.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const validateStudentData = (student, existingStudents = []) => {
    const errors = [];

    // Required fields
    if (!student.firstname) errors.push("First name required");
    if (!student.lastname) errors.push("Last name required");
    if (!student.studentid) errors.push("Student ID required");
    if (!student.lrn) errors.push("LRN required");
    if (!student.grade) errors.push("Grade required");
    if (!student.section) errors.push("Section required");

    // Email validation
    if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
      errors.push("Invalid email format");
    }

    // LRN validation (should be 12 digits)
    if (student.lrn && !/^\d{12}$/.test(student.lrn)) {
      errors.push("Invalid LRN (must be 12 digits)");
    }

    // Check for duplicate LRN in existing students
    if (student.lrn && existingStudents.some((s) => s.lrn === student.lrn)) {
      errors.push("LRN already exists in system");
    }

    // Check for duplicate Student ID in existing students
    if (
      student.studentid &&
      existingStudents.some((s) => s.studentId === student.studentid)
    ) {
      errors.push("Student ID already exists in system");
    }

    // Grade validation
    const normalizedGrade = (student.grade || "").trim();
    if (
      normalizedGrade &&
      !gradeOptions.some(
        (grade) => grade.toLowerCase() === normalizedGrade.toLowerCase(),
      )
    ) {
      errors.push("Invalid grade (must match the configured list)");
    }

    // Section validation
    const normalizedSection = (student.section || "").trim();
    if (
      normalizedSection &&
      !sections.some(
        (section) =>
          section.toLowerCase() === normalizedSection.toLowerCase(),
      )
    ) {
      errors.push("Invalid section (must be A-E)");
    }

    return errors;
  };

  const handleImport = async () => {
    setImporting(true);

    try {
      // Track LRNs and Student IDs within the CSV to detect duplicates
      const csvLRNs = new Set();
      const csvStudentIds = new Set();

      // Validate data
      const validStudents = [];
      const invalidStudents = [];

      csvData.forEach((student) => {
        const errors = validateStudentData(student, existingStudents);

        // Check for duplicates within the CSV file itself
        if (student.lrn && csvLRNs.has(student.lrn)) {
          errors.push("Duplicate LRN in CSV file");
        }
        if (student.studentid && csvStudentIds.has(student.studentid)) {
          errors.push("Duplicate Student ID in CSV file");
        }

        if (errors.length === 0) {
          // Add to tracking sets
          if (student.lrn) csvLRNs.add(student.lrn);
          if (student.studentid) csvStudentIds.add(student.studentid);

          validStudents.push({
            // Basic Information
            firstName: student.firstname || student.firstName,
            lastName: student.lastname || student.lastName,
            middleName: student.middlename || student.middleName || "",
            email: student.email,
            phoneNumber: student.phonenumber || student.phoneNumber || "",

            // Academic Information
            studentId: student.studentid || student.studentId,
            lrn: student.lrn, // Learner Reference Number (used as username)
            grade: student.grade,
            section: student.section,

            // Address Information
            barangay: student.barangay || "",
            municipality: student.municipality || "",
            province: student.province || "",
            fullAddress: student.fulladdress || student.fullAddress || "",

            // Parent/Guardian Information
            parentGuardianName:
              student.parentguardianname ||
              student.parentGuardianName ||
              student.parentname ||
              student.parentName ||
              "",
            parentPhone: student.parentphone || student.parentPhone || "",
            username: student.lrn,
          });
        } else {
          invalidStudents.push({
            ...student,
            errors,
          });
        }
      });

      if (validStudents.length === 0) {
        toast.error("No valid students found in the import file");
        setImporting(false);
        return;
      }

      // Import valid students
      const response = await studentsAPI.bulkImport(validStudents);

      setImportResults({
        success: response.data.results.success,
        errors: response.data.results.errors,
        details: response.data.results.details,
        invalidStudents,
      });

      setStep(3);

      if (response.data.results && response.data.results.success > 0) {
        toast.success(
          `Successfully imported ${response.data.results.success} students`,
        );
        setImportSuccessful(true);
      }

      if (response.data.results.errors > 0) {
        toast.error(
          `${response.data.results.errors} students failed to import`,
        );
      }
    } catch (error) {
      console.error("Import error:", error);
      const responseMessage = error?.response?.data?.message;
      const responseErrors = error?.response?.data?.errors;

      if (responseErrors && Array.isArray(responseErrors) && responseErrors.length > 0) {
        console.warn("Import validation errors:", responseErrors);
      }

      if (responseMessage) {
        toast.error(responseMessage);
      } else {
        toast.error("Failed to import students");
      }
    } finally {
      setImporting(false);
    }
  };

  const handleClose = async () => {
    const wasSuccessful = importSuccessful;

    // Reset all state first
    const successfulStudents = importResults?.details?.filter(detail => detail.status === 'success') || [];
    setFile(null);
    setCsvData([]);
    setImportResults(null);
    setStep(1);
    setExistingStudents([]);
    setImportSuccessful(false);
    setAttributeError("");
    setAutoPrintCards(true); // Reset to default

    // Generate a single combined PDF for the successfully imported students
    if (wasSuccessful && successfulStudents.length > 0 && autoPrintCards) {
      try {
        toast.loading("Generating library cards for imported students...");

        // Fetch all students and filter down to the newly imported ones
        const allStudentsResponse = await studentsAPI.getAll();
        const allStudents = allStudentsResponse.data.students || [];

        const importedStudents = allStudents.filter((student) =>
          successfulStudents.some((success) => success.studentId === student.studentId) && student.libraryCardNumber,
        );

        if (importedStudents.length > 0) {
          // Create a single PDF with all cards (front+back pages per student)
          try {
            const multiPDF = await import(/* webpackChunkName: "pdf-generator" */ '../../utils/pdfGenerator').then(m => m.generateLibraryCardsPDF(importedStudents));
            const filename = `library_cards_import_${Date.now()}.pdf`;
            downloadPDF(multiPDF, filename);
            toast.dismiss();
            toast.success(`Generated ${importedStudents.length} library cards successfully!`);
          } catch (err) {
            console.error('Failed to generate combined library cards PDF:', err);
            toast.dismiss();
            toast.error('Failed to generate library cards');
          }
        } else {
          toast.dismiss();
          toast.error('No imported students with assigned library card numbers found');
        }
      } catch (error) {
        toast.dismiss();
        toast.error('Failed to generate library cards');
        console.error('Error generating library cards after import:', error);
      }
    }

    // Close the dialog
    onClose();

    // Then trigger refresh if import was successful
    if (wasSuccessful && onImportComplete) {
      onImportComplete();
    }
  };

  const renderUploadStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Upload a CSV file with student data. Download the template below to see
          the required format.
        </Typography>
      </Alert>
      {gradeOptions.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Available grade levels: {gradeOptions.join(", ")}
        </Typography>
      )}
      <Box display="flex" gap={2} mb={3}>
        <Button
          variant="outlined"
          startIcon={<GetApp />}
          onClick={downloadTemplate}
        >
          Download Template{" "}
        </Button>{" "}
      </Box>
      <label htmlFor="csv-file-input" style={{display:'block',cursor:'pointer'}}>
        <Paper
          role="button"
          tabIndex={0}
          sx={{
            border: "2px dashed #ccc",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
            cursor: "pointer",
            "&:hover": { borderColor: "#22C55E" },
          }}
        >
          <CloudUpload aria-hidden="true" sx={{ fontSize: 48, color: "#666", mb: 2 }} />{" "}
          <Typography variant="h6" gutterBottom>
            Click or press Enter to upload CSV file{" "}
          </Typography>{" "}
          <Typography variant="body2" color="text.secondary">
            Supported format: CSV files only{" "}
          </Typography>{" "}
        </Paper>
      </label>
      <input
        id="csv-file-input"
        type="file"
        accept=".csv"
        aria-label="Upload students CSV"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      {file && (
        <Box mt={2}>
          <Typography variant="body2">
            Selected file: <strong> {file.name} </strong>{" "}
          </Typography>{" "}
        </Box>
      )}{" "}
    </Box>
  );

  const renderPreviewStep = () => {
    // Track duplicates within CSV
    const csvLRNs = new Set();
    const csvStudentIds = new Set();
    const duplicatesInCSV = new Set();

    // First pass: identify duplicates
    csvData.forEach((student) => {
      if (student.lrn) {
        if (csvLRNs.has(student.lrn)) {
          duplicatesInCSV.add(student.lrn);
        }
        csvLRNs.add(student.lrn);
      }
      if (student.studentid) {
        if (csvStudentIds.has(student.studentid)) {
          duplicatesInCSV.add(student.studentid);
        }
        csvStudentIds.add(student.studentid);
      }
    });

    return (
      <Box>
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Found {csvData.length}
            students in the CSV file.Review the data below and click Import to
            proceed.{" "}
          </Typography>{" "}
        </Alert>

        {/* Auto-print cards option */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={autoPrintCards}
                onChange={(e) => setAutoPrintCards(e.target.checked)}
                color="primary"
              />
            }
            label="Automatically generate and download library cards for imported students"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, display: 'block' }}>
            PDFs will be downloaded to your browser after successful import
          </Typography>
        </Box>

        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell> Name </TableCell> <TableCell> Email </TableCell>{" "}
                <TableCell> Student ID </TableCell> <TableCell> LRN </TableCell>{" "}
                <TableCell> Grade </TableCell> <TableCell> Section </TableCell>{" "}
                <TableCell> Status </TableCell>{" "}
              </TableRow>{" "}
            </TableHead>{" "}
            <TableBody>
              {csvData.map((student, index) => {
                const errors = validateStudentData(student, existingStudents);

                // Check for duplicates within CSV
                if (student.lrn && duplicatesInCSV.has(student.lrn)) {
                  errors.push("Duplicate LRN in CSV file");
                }
                if (
                  student.studentid &&
                  duplicatesInCSV.has(student.studentid)
                ) {
                  errors.push("Duplicate Student ID in CSV file");
                }

                const isValid = errors.length === 0;

                return (
                  <TableRow key={index}>
                    <TableCell>
                      {student.firstname || student.firstName}{" "}
                      {student.lastname || student.lastName}
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      {student.studentid || student.studentId}
                    </TableCell>
                    <TableCell>{student.lrn}</TableCell>
                    <TableCell>{student.grade}</TableCell>
                    <TableCell>{student.section}</TableCell>
                    <TableCell>
                      <Chip
                        label={isValid ? "Valid" : "Invalid"}
                        color={isValid ? "success" : "error"}
                        size="small"
                        icon={isValid ? <Check /> : <Error />}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>{" "}
          </Table>{" "}
        </TableContainer>{" "}
      </Box>
    );
  };

  const renderResultsStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Import completed!{importResults.success}
          students imported successfully, {importResults.errors}
          failed.{" "}
        </Typography>{" "}
      </Alert>
      {importResults.details && importResults.details.length > 0 && (
        <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell> Student ID </TableCell>{" "}
                <TableCell> Status </TableCell>{" "}
                <TableCell> Message </TableCell>{" "}
              </TableRow>{" "}
            </TableHead>{" "}
            <TableBody>
              {importResults.details.map((detail, index) => (
                <TableRow key={index}>
                  <TableCell>{detail.studentId}</TableCell>
                  <TableCell>
                    <Chip
                      label={detail.status === "success" ? "Success" : "Error"}
                      color={detail.status === "success" ? "success" : "error"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {detail.error || "Imported successfully"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>{" "}
          </Table>{" "}
        </TableContainer>
      )}{" "}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6"> Import Students </Typography>{" "}
          <IconButton onClick={handleClose}>
            <Close />
          </IconButton>{" "}
        </Box>{" "}
      </DialogTitle>
      <DialogContent>
        {importing && <LinearProgress sx={{ mb: 2 }} />}
        {attributeError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {attributeError}
          </Alert>
        )}
        {step === 1 && renderUploadStep()}
        {step === 2 && renderPreviewStep()}
        {step === 3 && renderResultsStep()}
      </DialogContent>
      <DialogActions>
        {" "}
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)}> Back </Button>{" "}
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || csvData.length === 0}
            >
              {importing
                ? "Importing..."
                : `Import ${csvData.length} Students`}{" "}
            </Button>{" "}
          </>
        )}{" "}
        {step === 3 && (
          <Button variant="contained" onClick={handleClose}>
            Done{" "}
          </Button>
        )}{" "}
      </DialogActions>{" "}
    </Dialog>
  );
};

export default StudentImportDialog;
