package ai.hash.rustextra

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiDirectoryNode
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiFile
import java.awt.Color

class ModuleGroup: TreeStructureProvider {
    override fun modify(parent: AbstractTreeNode<*>, children: MutableCollection<AbstractTreeNode<*>>, settings: ViewSettings?): MutableCollection<AbstractTreeNode<*>> {
        val nodes = ArrayList<AbstractTreeNode<*>>();

        val directories = HashMap<String, ModuleDirectoryNode>();

        for (child in children) {
            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    directories[file.name] = ModuleDirectoryNode.fromPsiFileNode(child);
                }
            }
        }

        for (child in children) {
            if (child is ModuleFileNode) {
                // the file has already been processed, therefore to not recurse endlessly we add prematurely
                nodes.add(child);
                continue;
            }

            if (child is PsiFileNode) {
                val file = child.virtualFile;

                if (file != null && !file.isDirectory && file.fileType is LanguageFileType) {
                    // figure out if we currently handle a rust file

                    // if (file.fileType.name == "Rust") {
                    if (file.extension == "rs") {
                        // the file is a rust file, we now need to find out if that file has a corresponding directory
                        // we can attach it to
                        val directory = directories[file.nameWithoutExtension];
                        if (directory != null) {
                            // highlight the file
                            directory.addPrepend(ModuleFileNode.fromPsiFileNode(child));

                            continue
                        }
                    }

                }
            }

            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    val directory = directories[file.name];
                    if (directory != null) {
                        nodes.add(directory)
                    };
                }

                continue
            }

            nodes.add(child);
        }

        return nodes;
    }
}